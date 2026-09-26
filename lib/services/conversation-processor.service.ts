import "server-only";
import crypto from "node:crypto";
import { Prisma, type Conversation, type ConversationMessage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sleep } from "@/lib/retry";
import { isBurstReady } from "@/lib/conversation/burst";
import { computeMissingFacts, hasRealEstateInterest, INTENT_LABELS, isNonCommercial, type ConversationIntentCode } from "@/lib/conversation/policy";
import { PROMPT_VERSION } from "@/lib/conversation/prompt";
import {
  findConversationsDueForProcessing,
  releaseLease,
  tryClaimLease,
  isSimulatorConversation,
} from "@/lib/services/conversation.service";
import { getAssistantSettings, assistantHandles } from "@/lib/services/assistant-settings.service";
import { runAssistantTurn, storedFacts, type HistoryMessage } from "@/lib/services/conversation-agent.service";
import { recordEscalation, requestCommercialHandoff } from "@/lib/services/conversation-handoff.service";
import { sendWhatsAppText, ManyChatApiError, ManyChatTimeoutError } from "@/lib/services/manychat.service";

/** Reintentos del turno completo si OpenAI/infra falla: luego respuesta fija + pendiente humano. */
const TURN_RETRY_DELAYS_S = [10, 30, 90];
/** Reintentos de envío ante error explícito de ManyChat (nunca ante timeout ambiguo). */
const MAX_SEND_ATTEMPTS = 3;
/** Ventana de servicio de WhatsApp: fuera de ella el texto libre no es válido. */
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000 - 5 * 60 * 1000;

const FALLBACK_REPLY =
  "Gracias por tu mensaje. En este momento no pude procesarlo automáticamente; ya quedó registrado para que una persona del equipo de Century 21 Innova te atienda por este medio.";

export type ProcessOutcome = "processed" | "idle" | "busy" | "waiting" | "not_handled" | "failed";

function newOwner(): string {
  return `p_${crypto.randomUUID()}`;
}

async function loadHistory(conversationId: string): Promise<HistoryMessage[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: {
      conversationId,
      OR: [
        { role: "USER" },
        { role: { in: ["ASSISTANT", "HUMAN_AGENT"] }, status: { in: ["SENT", "SIMULATED", "UNCERTAIN", "QUEUED", "SENDING"] } },
      ],
    },
    orderBy: { seq: "desc" },
    take: 60,
    select: { role: true, text: true },
  });
  return messages.reverse().map((m) => ({ role: m.role as HistoryMessage["role"], text: m.text }));
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
    loadHistory(conversation.id),
    prisma.conversationMessage.count({ where: { conversationId: conversation.id, role: "ASSISTANT", status: { notIn: ["FAILED", "CANCELLED"] } } }),
  ]);

  let result: Awaited<ReturnType<typeof runAssistantTurn>>;
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
  const reply = final.reply.trim();

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
        ...(result.humanRequested
          ? { control: "HUMAN", controlReason: "El cliente pidió atención humana (IA en pausa).", controlChangedAt: new Date(), controlChangedBy: "assistant" }
          : {}),
      },
    });
    await tx.conversationTurn.update({ where: { id: turn.id }, data: { ...turnData, status: "COMPLETED" } });
    return true;
  });

  if (committed) await recordPostHandoffFollowUp(conversation, primary, secondary, final.summary);
  return committed ? "completed" : "superseded";
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
  const known = new Set<string>([before.primaryIntent, ...before.secondaryIntents]);
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
      await requestCommercialHandoff({
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
      handled += 1;
    } finally {
      await releaseLease(conversation.id, owner);
    }
  }
  return handled;
}
