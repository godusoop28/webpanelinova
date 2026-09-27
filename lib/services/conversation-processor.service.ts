import "server-only";
import crypto from "node:crypto";
import { Prisma, type Conversation, type ConversationMessage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sleep } from "@/lib/retry";
import { isBurstReady } from "@/lib/conversation/burst";
import { computeMissingFacts, hasRealEstateInterest, INTENT_LABELS, isNonCommercial, type ConversationIntentCode } from "@/lib/conversation/policy";
import { PROMPT_VERSION } from "@/lib/conversation/prompt";
import {
  buildAssignmentConfirmation,
  buildWaitNotice,
  handoffInCurrentSession,
  isLowSignalMessage,
  isWaiting,
  mentionsAdvisor,
  remainingWaitMinutes,
  shouldSendWaitNotice,
  type WaitReason,
} from "@/lib/conversation/session";
import { BRAND_NAME } from "@/lib/brand";
import {
  findConversationsDueForProcessing,
  releaseLease,
  sessionOpeningData,
  tryClaimLease,
  isSimulatorConversation,
} from "@/lib/services/conversation.service";
import { getAssistantSettings, assistantHandles } from "@/lib/services/assistant-settings.service";
import { previousContextOf, runAssistantTurn, storedFacts, type AgentTurnResult, type HistoryMessage } from "@/lib/services/conversation-agent.service";
import { loadAssignmentFacts, recordEscalation, requestCommercialHandoff } from "@/lib/services/conversation-handoff.service";
import { contactKeyFor, recordPropertyInquirySafe } from "@/lib/services/property-inquiry.service";
import { sendWhatsAppText, ManyChatApiError, ManyChatTimeoutError } from "@/lib/services/manychat.service";

/** Reintentos del turno completo si OpenAI/infra falla: luego respuesta fija + pendiente humano. */
const TURN_RETRY_DELAYS_S = [10, 30, 90];
/** Reintentos de envío ante error explícito de ManyChat (nunca ante timeout ambiguo). */
const MAX_SEND_ATTEMPTS = 3;
/** Ventana de servicio de WhatsApp: fuera de ella el texto libre no es válido. */
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const FALLBACK_REPLY = `Gracias por tu mensaje. En este momento no pude procesarlo automáticamente; ya quedó registrado para que una persona del equipo de ${BRAND_NAME} te atienda.`;

export type ProcessOutcome = "processed" | "idle" | "busy" | "waiting" | "not_handled" | "failed";

function newOwner(): string {
  return `p_${crypto.randomUUID()}`;
}

async function loadHistory(conversation: Pick<Conversation, "id" | "sessionStartSeq" | "processedSeq">): Promise<HistoryMessage[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId: conversation.id,
      OR: [
        { role: "USER" },
        { role: { in: ["ASSISTANT", "HUMAN_AGENT"] }, status: { in: ["SENT", "SIMULATED", "UNCERTAIN", "QUEUED", "SENDING"] } },
      ],
    },
    orderBy: { seq: "desc" },
    take: 60,
    select: { role: true, text: true, seq: true },
  });
  return messages.reverse().map((m) => ({
    role: m.role as HistoryMessage["role"],
    text: m.text,
    previousSession: m.seq < conversation.sessionStartSeq,
    isNew: m.seq > conversation.processedSeq,
  }));
}

/**
 * Procesa una conversación hasta dejarla al día o agotar `budgetMs`.
 * Seguro de llamar en paralelo: solo quien obtiene el lease trabaja; los
 * demás esperan a que se libere (por si el dueño ya había revisado antes de
 * que llegara su mensaje) y, si no, lo deja al cron de recuperación.
 */
export async function processConversation(conversationId: string, budgetMs = 50_000): Promise<ProcessOutcome> {
  const deadline = Date.now() + budgetMs;
  const owner = newOwner();

  while (!(await tryClaimLease(conversationId, owner))) {
    if (Date.now() + 1500 > deadline) return "busy";
    await sleep(1500);
  }

  let outcome: ProcessOutcome = "idle";
  try {
    for (let iteration = 0; iteration < 6; iteration++) {
      const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
      if (!conversation) return "idle";
      await tryClaimLease(conversationId, owner); // renueva

      if (conversation.processedSeq >= conversation.lastSeq) {
        await prisma.conversation.updateMany({
          where: { id: conversationId, lastSeq: conversation.lastSeq },
          data: { processAfter: null, burstStartedAt: null },
        });
        break;
      }

      const settings = await getAssistantSettings(conversation.companyId);
      if (conversation.control !== "AI" || (!isSimulatorConversation(conversation) && !assistantHandles(settings, conversation.manyChatSubscriberId))) {
        // Otra persona/el flujo anterior atiende: no se responde ni se reintenta.
        await prisma.conversation.updateMany({
          where: { id: conversationId, lastSeq: conversation.lastSeq },
          data: { processAfter: null, burstStartedAt: null, ...(conversation.control === "AI" ? { processedSeq: conversation.lastSeq } : {}) },
        });
        outcome = "not_handled";
        break;
      }

      const now = new Date();
      if (!isBurstReady(conversation.processAfter, now)) {
        const waitMs = conversation.processAfter!.getTime() - now.getTime();
        if (Date.now() + waitMs + 20_000 > deadline) {
          outcome = "waiting"; // lo retoma otra invocación o el cron
          break;
        }
        await sleep(Math.min(waitMs + 50, 30_000));
        continue;
      }

      // Espera tras canalizar: aviso fijo (sin IA, sin reasignar). Vencida,
      // los mensajes pendientes abren una sesión nueva con la IA.
      if (conversation.reopenAt) {
        if (isWaiting(conversation.reopenAt, now)) {
          await runWaitNotice(conversation);
          outcome = "processed";
        } else {
          await openSessionForPending(conversation.id, now);
        }
        continue;
      }

      const result = await runTurn(conversation);
      outcome = result === "failed" ? "failed" : "processed";
      if (result === "failed") break;
      // "superseded": llegó otro mensaje durante el turno; se repite el ciclo
      // con todo junto (respetando la nueva espera de ráfaga).
    }

    await flushOutbox(conversationId);
  } finally {
    await releaseLease(conversationId, owner);
  }

  // Cierre de carrera: si llegó un mensaje justo mientras soltábamos el
  // lease y su invocación ya se rindió, lo tomamos nosotros.
  const after = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { lastSeq: true, processedSeq: true, control: true, processAfter: true, leaseUntil: true, consecutiveFailures: true },
  });
  if (
    after &&
    after.control === "AI" &&
    after.consecutiveFailures === 0 && // un reintento con backoff lo retoma el cron, no esta invocación
    outcome !== "failed" &&
    after.processedSeq < after.lastSeq &&
    !after.leaseUntil &&
    after.processAfter &&
    Date.now() + 25_000 < deadline
  ) {
    return processConversation(conversationId, deadline - Date.now());
  }
  return outcome;
}

async function runTurn(conversation: Conversation): Promise<"completed" | "superseded" | "failed"> {
  const settings = await getAssistantSettings(conversation.companyId);
  const targetSeq = conversation.lastSeq;
  const fromSeq = conversation.processedSeq + 1;
  const startedAt = Date.now();
  const turn = await prisma.conversationTurn.create({
    data: { conversationId: conversation.id, fromSeq, toSeq: targetSeq, status: "RUNNING" },
  });

  const [history, previousReplies] = await Promise.all([
    loadHistory(conversation),
    prisma.conversationMessage.count({ where: { conversationId: conversation.id, role: "ASSISTANT", status: { notIn: ["FAILED", "CANCELLED"] } } }),
  ]);

  let result: AgentTurnResult;
  try {
    result = await runAssistantTurn({ conversation, settings, history, isFirstReply: previousReplies === 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[ASSISTANT] turno falló", conversation.id, message);
    await handleTurnFailure(conversation, turn.id, message, Date.now() - startedAt);
    return "failed";
  }

  const { final } = result;
  const primary = final.primary_intent as ConversationIntentCode;
  const secondary = [...new Set(final.secondary_intents as ConversationIntentCode[])].filter((i) => i !== primary && i !== "UNKNOWN");
  const clarificationCount = final.asked_clarification && !final.made_progress ? conversation.clarificationCount + 1 : final.made_progress ? 0 : conversation.clarificationCount;
  const properties = mergeProperties(conversation.properties, result.verifiedProperties);
  let reply = final.reply.trim();

  const stateUpdate: Prisma.ConversationUpdateManyMutationInput = {
    primaryIntent: primary,
    secondaryIntents: secondary,
    facts: result.facts as Prisma.InputJsonValue,
    properties: properties as unknown as Prisma.InputJsonValue,
    missingData: computeMissingFacts(primary, result.facts),
    summary: final.summary.slice(0, 1200) || conversation.summary,
    clarificationCount,
    consecutiveFailures: 0,
    lastError: null,
    lastActivityAt: new Date(),
  };
  const turnData = {
    model: result.model,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    toolCalls: { tools: result.toolTrace, corrections: result.corrections, promptVersion: PROMPT_VERSION } as unknown as Prisma.InputJsonValue,
    durationMs: Date.now() - startedAt,
  };

  // El cliente debe saber a quién quedó asignada su solicitud, una sola vez
  // por canalización, con el nombre real del backend (no el que diga la IA).
  const afterTools = await prisma.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
  let assignmentNotice = false;
  if (
    !afterTools.assignmentNoticeAt &&
    handoffInCurrentSession(afterTools) &&
    (afterTools.handoffState === "ASSIGNED" || afterTools.handoffState === "EXISTING_LEAD" || afterTools.handoffState === "NO_ADVISOR")
  ) {
    const facts = await loadAssignmentFacts(afterTools);
    if (facts) {
      if (!reply) reply = buildAssignmentConfirmation(facts);
      else if (facts.advisorName && !mentionsAdvisor(reply, facts.advisorName)) reply = `${reply}\n\n${buildAssignmentConfirmation(facts)}`;
      assignmentNotice = true;
    }
  }

  // Control de versión: solo se responde si no llegó nada nuevo desde que
  // empezó el turno. Si llegó, se conserva lo aprendido (y cualquier acción
  // ya ejecutada, que es idempotente) pero la respuesta se descarta.
  const committed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    if (current.lastSeq !== targetSeq) {
      await tx.conversation.update({ where: { id: conversation.id }, data: stateUpdate });
      await tx.conversationTurn.update({ where: { id: turn.id }, data: { ...turnData, status: "SUPERSEDED" } });
      return false;
    }
    let seq = current.lastSeq;
    if (reply) {
      seq += 1;
      await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          companyId: conversation.companyId,
          seq,
          role: "ASSISTANT",
          text: reply,
          status: isSimulatorConversation(conversation) ? "SIMULATED" : "QUEUED",
          turnId: turn.id,
        },
      });
    }
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        ...stateUpdate,
        lastSeq: seq,
        processedSeq: seq,
        processAfter: null,
        burstStartedAt: null,
        // Pedir una persona ya no detiene la IA para siempre: abre la espera
        // automática (requestHuman). La pausa permanente es solo manual.
        ...(assignmentNotice && reply ? { assignmentNoticeAt: new Date() } : {}),
      },
    });
    await tx.conversationTurn.update({ where: { id: turn.id }, data: { ...turnData, status: "COMPLETED" } });
    return true;
  });

  await recordTurnInquiries(afterTools, result, fromSeq, targetSeq);
  if (committed && !result.handoff) await recordPostHandoffFollowUp(conversation, primary, secondary, final.summary);
  return committed ? "completed" : "superseded";
}

/**
 * Relación contacto ↔ propiedad consultada, con método y evidencia. Solo
 * propiedades identificadas con certeza o confirmadas por el cliente (no
 * candidatas que solo se mostraron). Una canalización sin propiedad no
 * registra ninguna.
 */
async function recordTurnInquiries(conversation: Conversation, result: AgentTurnResult, fromSeq: number, toSeq: number) {
  const ids = new Set<string>(result.final.property_ids.map((id) => id.toUpperCase()).filter((id) => result.identified.has(id)));
  if (result.handoffPropertyId) ids.add(result.handoffPropertyId);
  if (ids.size === 0) return;
  const messageCount = await prisma.conversationMessage.count({
    where: { conversationId: conversation.id, role: "USER", seq: { gte: fromSeq, lte: toSeq } },
  });
  const heardFrom = result.facts.heard_from?.status === "known" ? result.facts.heard_from.value : null;
  for (const publicId of ids) {
    const identified = result.identified.get(publicId);
    await recordPropertyInquirySafe({
      companyId: conversation.companyId,
      publicId,
      contactKey: contactKeyFor(conversation),
      conversationId: conversation.id,
      leadId: conversation.leadId,
      method: identified?.method ?? "handoff",
      evidence: identified?.evidence ?? publicId,
      linkPortal: identified?.linkPortal ?? null,
      declaredSource: heardFrom,
      messageCount: Math.max(1, messageCount),
      source: "assistant",
      isTest: conversation.isTest,
    });
  }
}

/** Mensajes que llegaron durante la espera pero se procesan ya vencida: abren la sesión nueva desde el primero pendiente. */
async function openSessionForPending(conversationId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    if (!current.reopenAt || isWaiting(current.reopenAt, now)) return;
    await tx.conversation.update({
      where: { id: conversationId },
      data: await sessionOpeningData(tx, current, current.processedSeq + 1, now),
    });
  });
}

/**
 * Aviso durante la espera tras canalizar. Fijo (no generado), con el nombre
 * real del asesor cuando hay asignación confirmada y el tiempo restante; a
 * lo más uno cada 5 minutos (una ráfaga es un solo aviso). No reasigna, no
 * crea lead y no prolonga la espera. Lo que el cliente agregue con
 * información útil queda como pendiente de seguimiento en el panel.
 */
async function runWaitNotice(conversation: Conversation): Promise<"done" | "superseded"> {
  const now = new Date();
  const targetSeq = conversation.lastSeq;
  const fromSeq = conversation.processedSeq + 1;
  const pending = await prisma.conversationMessage.findMany({
    where: { conversationId: conversation.id, role: "USER", seq: { gte: fromSeq, lte: targetSeq } },
    orderBy: { seq: "asc" },
    select: { text: true },
  });
  const useful = pending.map((m) => m.text).filter((text) => !isLowSignalMessage(text));
  let savedForTeam = false;
  if (useful.length > 0) {
    await recordEscalation(conversation, "FOLLOW_UP", `Mensaje del cliente durante la espera tras canalizar: ${useful.join(" / ")}`.slice(0, 1000));
    savedForTeam = true;
  }

  const send = shouldSendWaitNotice({ now, waitNoticeAt: conversation.waitNoticeAt });
  const reason = (conversation.reopenReason as WaitReason | null) ?? "commercial";
  const assignment = reason === "commercial" ? await loadAssignmentFacts(conversation) : null;
  const text = send
    ? buildWaitNotice({ reason, assignment, minutesLeft: remainingWaitMinutes(conversation.reopenAt!, now), savedForTeam })
    : null;

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    if (current.lastSeq !== targetSeq) return "superseded" as const;
    let seq = current.lastSeq;
    if (text) {
      seq += 1;
      await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          companyId: conversation.companyId,
          seq,
          role: "ASSISTANT",
          text,
          status: isSimulatorConversation(conversation) ? "SIMULATED" : "QUEUED",
          metadata: { waitNotice: true, reopenAt: current.reopenAt?.toISOString() ?? null },
        },
      });
    }
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastSeq: seq,
        processedSeq: seq,
        processAfter: null,
        burstStartedAt: null,
        lastActivityAt: now,
        ...(text ? { waitNoticeAt: now } : {}),
        ...(text && assignment?.advisorName && !current.assignmentNoticeAt ? { assignmentNoticeAt: now } : {}),
      },
    });
    return "done" as const;
  });
}

/**
 * Política explícita tras canalizar: NO se reasigna ni se crea otro lead.
 * Si el cliente trae una necesidad nueva (p. ej. además quiere vender su
 * casa) o reclama seguimiento, queda un pendiente FOLLOW_UP visible en el
 * panel — determinista, sin depender de que la IA llame una herramienta.
 */
async function recordPostHandoffFollowUp(
  before: Conversation,
  primary: ConversationIntentCode,
  secondary: ConversationIntentCode[],
  summary: string
) {
  if (before.handoffState !== "ASSIGNED" && before.handoffState !== "EXISTING_LEAD") return;
  const previous = previousContextOf(before) as { primaryIntent?: string; secondaryIntents?: string[] } | null;
  const known = new Set<string>([before.primaryIntent, ...before.secondaryIntents, previous?.primaryIntent ?? "UNKNOWN", ...(previous?.secondaryIntents ?? [])]);
  const added = [primary, ...secondary].filter((intent) => intent !== "UNKNOWN" && intent !== "HUMAN_REQUEST" && !known.has(intent));
  if (added.length > 0) {
    await recordEscalation(before, "FOLLOW_UP", `Nueva necesidad tras la canalización: ${added.map((i) => INTENT_LABELS[i]).join(", ")}. ${summary}`);
  } else if (primary === "HUMAN_REQUEST") {
    await recordEscalation(before, "FOLLOW_UP", `El cliente ya canalizado pide atención o seguimiento. ${summary}`);
  }
}

function mergeProperties(stored: Prisma.JsonValue | null, verified: { publicId: string; title: string; url: string | null }[]) {
  const list = Array.isArray(stored) ? (stored as { publicId: string; title: string; url: string | null }[]) : [];
  const byId = new Map(list.map((p) => [p.publicId, p]));
  for (const property of verified) byId.set(property.publicId, { ...property });
  return [...byId.values()].slice(-10);
}

async function handleTurnFailure(conversation: Conversation, turnId: string, message: string, durationMs: number) {
  const failures = conversation.consecutiveFailures + 1;
  await prisma.conversationTurn.update({ where: { id: turnId }, data: { status: "FAILED", error: message.slice(0, 1000), durationMs } });

  if (failures <= TURN_RETRY_DELAYS_S.length) {
    // Mensajes conservados; se reintenta el turno completo más tarde.
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        consecutiveFailures: failures,
        lastError: message.slice(0, 1000),
        processAfter: new Date(Date.now() + TURN_RETRY_DELAYS_S[failures - 1] * 1000),
      },
    });
    return;
  }

  // Agotado: respuesta fija (no generada) una sola vez, pendiente visible y
  // la IA se detiene para este contacto hasta que alguien la reanude.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversation.id} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversation.id } });
    const seq = current.lastSeq + 1;
    await tx.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        companyId: conversation.companyId,
        seq,
        role: "ASSISTANT",
        text: FALLBACK_REPLY,
        status: isSimulatorConversation(conversation) ? "SIMULATED" : "QUEUED",
        turnId,
        metadata: { fallback: true },
      },
    });
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastSeq: seq,
        processedSeq: seq,
        processAfter: null,
        burstStartedAt: null,
        consecutiveFailures: failures,
        lastError: message.slice(0, 1000),
        control: "HUMAN",
        controlReason: "La IA falló varias veces seguidas; requiere atención humana.",
        controlChangedAt: new Date(),
        controlChangedBy: "system",
      },
    });
  });
  await recordEscalation(conversation, "PROCESSING_ERROR", `El asistente no pudo responder tras ${failures} intentos: ${message}`);
}

// ---------------------------------------------------------------------------
// Outbox: envíos ordenados por conversación, con estados honestos.
// ---------------------------------------------------------------------------

export async function flushOutbox(conversationId: string): Promise<void> {
  const queued = await prisma.conversationMessage.findMany({
    where: { conversationId, status: { in: ["QUEUED"] } },
    orderBy: { seq: "asc" },
  });
  if (queued.length === 0) return;
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });

  for (const message of queued) {
    const ok = await sendOne(conversation, message);
    // Un mensaje en espera de reintento bloquea los siguientes: el orden importa.
    if (!ok) break;
  }
}

/** true si el mensaje quedó en un estado final (enviado, fallido o incierto) y se puede seguir con el siguiente. */
async function sendOne(conversation: Conversation, message: ConversationMessage): Promise<boolean> {
  if (isSimulatorConversation(conversation)) {
    await prisma.conversationMessage.update({ where: { id: message.id }, data: { status: "SIMULATED" } });
    return true;
  }
  if (!conversation.lastInboundAt || Date.now() - conversation.lastInboundAt.getTime() > WHATSAPP_WINDOW_MS) {
    await prisma.conversationMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", lastError: "Fuera de la ventana de 24 h de WhatsApp: requiere plantilla aprobada." },
    });
    return true;
  }

  // Reclamo atómico: QUEUED → SENDING. Si otro proceso lo tomó, no se duplica.
  const claimed = await prisma.conversationMessage.updateMany({
    where: { id: message.id, status: "QUEUED" },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return false;

  try {
    await sendWhatsAppText(conversation.manyChatSubscriberId, message.text);
    const sentAt = new Date();
    await prisma.conversationMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt, lastError: null } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: sentAt } });
    return true;
  } catch (error) {
    if (error instanceof ManyChatTimeoutError) {
      // Ambiguo: ManyChat pudo haberlo entregado. No se reintenta solo.
      await prisma.conversationMessage.update({
        where: { id: message.id },
        data: { status: "UNCERTAIN", lastError: "Timeout de ManyChat: el mensaje pudo haberse entregado. Revisar antes de reenviar." },
      });
      return true;
    }
    const attempts = message.attempts + 1;
    const detail = error instanceof ManyChatApiError ? `${error.message} ${JSON.stringify(error.body).slice(0, 300)}` : error instanceof Error ? error.message : "Error desconocido";
    const finalFailure = attempts >= MAX_SEND_ATTEMPTS || (error instanceof ManyChatApiError && error.status >= 400 && error.status < 500 && error.status !== 429);
    await prisma.conversationMessage.update({
      where: { id: message.id },
      data: { status: finalFailure ? "FAILED" : "QUEUED", lastError: detail.slice(0, 1000) },
    });
    if (finalFailure) {
      await recordEscalation(conversation, "PROCESSING_ERROR", `No se pudo enviar una respuesta por ManyChat: ${detail.slice(0, 300)}`);
    }
    return finalFailure;
  }
}

// ---------------------------------------------------------------------------
// Cron de recuperación (cada minuto)
// ---------------------------------------------------------------------------

export interface SweepSummary {
  conversations: number;
  outboxes: number;
  abandoned: number;
  staleSending: number;
}

export async function sweepConversations(budgetMs = 50_000): Promise<SweepSummary> {
  const deadline = Date.now() + budgetMs;
  const summary: SweepSummary = { conversations: 0, outboxes: 0, abandoned: 0, staleSending: 0 };

  // Un proceso que murió entre "SENDING" y el resultado deja el envío en
  // duda: no se reenvía (podría duplicar), se marca incierto y visible.
  const stale = await prisma.conversationMessage.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
    data: { status: "UNCERTAIN", lastError: "El proceso se interrumpió durante el envío; pudo haberse entregado." },
  });
  summary.staleSending = stale.count;
  await prisma.conversationTurn.updateMany({
    where: { status: "RUNNING", createdAt: { lt: new Date(Date.now() - 5 * 60 * 1000) } },
    data: { status: "FAILED", error: "El proceso terminó antes de completar el turno." },
  });

  const due = await findConversationsDueForProcessing(10);
  for (const conversation of due) {
    if (Date.now() + 20_000 > deadline) break;
    await processConversation(conversation.id, Math.min(45_000, deadline - Date.now()));
    summary.conversations += 1;
  }

  const pendingOutbox = await prisma.conversationMessage.findMany({
    where: { status: "QUEUED", updatedAt: { lt: new Date(Date.now() - 20_000) } },
    distinct: ["conversationId"],
    select: { conversationId: true },
    take: 10,
  });
  for (const { conversationId } of pendingOutbox) {
    if (Date.now() + 10_000 > deadline) break;
    const owner = newOwner();
    if (await tryClaimLease(conversationId, owner)) {
      try {
        await flushOutbox(conversationId);
        summary.outboxes += 1;
      } finally {
        await releaseLease(conversationId, owner);
      }
    }
  }

  if (Date.now() + 15_000 < deadline) summary.abandoned = await handleAbandonedConversations(deadline);
  return summary;
}

/**
 * Cliente con interés inmobiliario CONFIRMADO que deja de responder: se
 * canaliza lo disponible (regla explícita, configurable). Nunca aplica a
 * proveedores/gerencia ni a quien solo saludó.
 */
async function handleAbandonedConversations(deadline: number): Promise<number> {
  const candidates = await prisma.conversation.findMany({
    where: {
      control: "AI",
      handoffState: "NONE",
      primaryIntent: { notIn: ["UNKNOWN", "PROVIDER", "MANAGEMENT", "OTHER", "HUMAN_REQUEST"] },
      lastInboundAt: { lt: new Date(Date.now() - 60_000), gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      lastOutboundAt: { not: null },
    },
    take: 20,
    orderBy: { lastInboundAt: "asc" },
  });
  let handled = 0;
  for (const conversation of candidates) {
    if (Date.now() + 10_000 > deadline) break;
    const settings = await getAssistantSettings(conversation.companyId);
    if (settings.abandonHandoffMinutes <= 0) continue;
    const idleSince = Date.now() - settings.abandonHandoffMinutes * 60 * 1000;
    if (!conversation.lastInboundAt || conversation.lastInboundAt.getTime() > idleSince) continue;
    // El bot respondió último: esperábamos al cliente y no volvió.
    if (!conversation.lastOutboundAt || conversation.lastOutboundAt < conversation.lastInboundAt) continue;
    if (conversation.processedSeq < conversation.lastSeq) continue;

    const primary = conversation.primaryIntent as ConversationIntentCode;
    const secondary = conversation.secondaryIntents as ConversationIntentCode[];
    if (isNonCommercial(primary) || !hasRealEstateInterest(primary, secondary)) continue;

    const owner = newOwner();
    if (!(await tryClaimLease(conversation.id, owner))) continue;
    try {
      const properties = Array.isArray(conversation.properties) ? (conversation.properties as { publicId: string }[]) : [];
      const handoff = await requestCommercialHandoff({
        conversation,
        settings,
        primaryIntent: primary,
        secondaryIntents: secondary,
        facts: storedFacts(conversation),
        summary: conversation.summary,
        reason: "El cliente dejó de responder tras mostrar interés inmobiliario; se canaliza con la información disponible.",
        propertyPublicId: properties.length === 1 ? properties[0].publicId : null,
        trigger: "abandonment",
      });
      // El cliente ya no escribe: se le confirma una sola vez a quién quedó
      // asignada su solicitud (dentro de la ventana de WhatsApp; si no, queda FAILED visible).
      if (handoff.status === "assigned" || handoff.status === "existing_lead" || handoff.status === "no_advisor_available") {
        await queueAssignmentConfirmation(conversation.id);
        await flushOutbox(conversation.id);
      }
      handled += 1;
    } finally {
      await releaseLease(conversation.id, owner);
    }
  }
  return handled;
}

/** Encola la confirmación de la canalización si todavía no se le comunicó al cliente. */
async function queueAssignmentConfirmation(conversationId: string) {
  const fresh = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (fresh.assignmentNoticeAt) return;
  const facts = await loadAssignmentFacts(fresh);
  if (!facts) return;
  const text = buildAssignmentConfirmation(facts);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId} FOR UPDATE`;
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    if (current.assignmentNoticeAt) return;
    const seq = current.lastSeq + 1;
    const caughtUp = current.processedSeq === current.lastSeq;
    await tx.conversationMessage.create({
      data: {
        conversationId,
        companyId: current.companyId,
        seq,
        role: "ASSISTANT",
        text,
        status: isSimulatorConversation(current) ? "SIMULATED" : "QUEUED",
        metadata: { assignmentConfirmation: true },
      },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastSeq: seq, ...(caughtUp ? { processedSeq: seq } : {}), assignmentNoticeAt: new Date(), lastActivityAt: new Date() },
    });
  });
}
