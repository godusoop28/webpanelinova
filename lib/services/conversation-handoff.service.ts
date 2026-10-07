import "server-only";
import { Prisma, type AssistantSettings, type Conversation, type EscalationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env, isLiveAutomation } from "@/lib/env";
import { classifyInterest } from "@/lib/interest-classification";
import { pickWeightedLeastAssigned } from "@/lib/assignment-engine";
import {
  decideCommercialHandoff,
  INTENT_LABELS,
  isRealEstateIntent,
  type ConversationIntentCode,
  type Facts,
  type HandoffTrigger,
} from "@/lib/conversation/policy";
import {
  buildAssignmentConfirmation,
  computeReopenAt,
  handoffInCurrentSession,
  type AssignmentFacts,
  type WaitReason,
} from "@/lib/conversation/session";
import { processIncomingLead, DuplicatePhoneLeadError, ADVISOR_LEAD_FIELD_IDS } from "@/lib/services/lead.service";
import { getRotationCandidatesForSimulation } from "@/lib/services/assignment.service";
import { findAdvisorByEasyBrokerEmail } from "@/lib/repositories/advisor.repository";
import { findLeadByRequestId } from "@/lib/repositories/lead.repository";
import { lookupProperty } from "@/lib/services/property-catalog.service";
import { notifyAdvisor } from "@/lib/services/manychat.service";
import { applyRounds } from "@/lib/advisor-rounds";
import { logAuditEvent } from "@/lib/services/audit.service";

const ASSISTANT_ORIGIN = "WhatsApp IA";

/**
 * Resultado real de la canalización. `advisor_name` y `customer_message`
 * los arma el backend a partir de lo que ocurrió (nunca los inventa la IA).
 */
export type CommercialHandoffResult =
  | {
      status: "assigned";
      simulated: boolean;
      advisor_name: string | null;
      /** Asignación local registrada (LeadAssignment). */
      assignment_recorded: boolean;
      /** Aviso al asesor enviado por ManyChat (false = pendiente/reintento). */
      advisor_notified: boolean;
      /** Contacto confirmado en EasyBroker (false = pendiente/reintento). */
      crm_synced: boolean;
      customer_message: string;
    }
  | { status: "already_assigned"; advisor_name: string | null; follow_up_recorded: boolean; customer_message: string | null }
  | { status: "existing_lead"; advisor_name: string | null; follow_up_recorded: boolean; customer_message: string }
  | { status: "no_advisor_available"; pending_recorded: boolean; customer_message: string }
  | { status: "rejected"; reason: string }
  | { status: "error"; retryable: boolean };

function advisorDisplayName(name: string | null | undefined): string | null {
  const value = name?.replace(/\s+/g, " ").trim();
  return value || null;
}

export function conversationPanelUrl(conversationId: string): string | null {
  const base = env.assistant.panelUrl;
  return base ? `${base}/conversaciones/${conversationId}` : null;
}

/**
 * Campos que abren la espera automática tras una canalización completada:
 * contada desde ahora (la canalización), nunca desde mensajes posteriores.
 */
export function waitFields(settings: Pick<AssistantSettings, "handoffReopenMinutes">, reason: WaitReason, now = new Date()) {
  return {
    reopenAt: computeReopenAt(now, settings.handoffReopenMinutes),
    reopenReason: reason,
    waitNoticeAt: null,
  };
}

/** Una sola escalación abierta por tipo y conversación: evita spam de pendientes. */
export async function recordEscalation(
  conversation: Pick<Conversation, "id" | "companyId">,
  type: EscalationType,
  reason: string
): Promise<{ id: string; created: boolean }> {
  const open = await prisma.conversationEscalation.findFirst({
    where: { conversationId: conversation.id, type, status: { not: "RESOLVED" } },
    select: { id: true },
  });
  if (open) {
    await prisma.conversationEscalation.update({
      where: { id: open.id },
      data: { reason: reason.slice(0, 1000), updatedAt: new Date() },
    });
    return { id: open.id, created: false };
  }
  const created = await prisma.conversationEscalation.create({
    data: { companyId: conversation.companyId, conversationId: conversation.id, type, reason: reason.slice(0, 1000) },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/**
 * Estado real de la canalización para decírselo al cliente: nombre del
 * asesor asignado (de la base, no de la IA) y si el aviso se envió.
 */
export async function loadAssignmentFacts(
  conversation: Pick<Conversation, "leadId" | "handoffState" | "handoffReason" | "isTest">
): Promise<AssignmentFacts | null> {
  if (conversation.handoffState === "NO_ADVISOR") return { status: "no_advisor", advisorName: null, advisorNotified: false };
  if (conversation.handoffState !== "ASSIGNED" && conversation.handoffState !== "EXISTING_LEAD") return null;
  if (!conversation.leadId) {
    // Conversación de prueba: no hay lead; se usa el asesor que tocaría (simulación).
    const simulated = conversation.isTest ? /tocaría a (.+?) por /.exec(conversation.handoffReason ?? "")?.[1] ?? null : null;
    return simulated ? { status: "assigned", advisorName: simulated, advisorNotified: false } : null;
  }
  const lead = await prisma.lead.findUnique({
    where: { id: conversation.leadId },
    select: {
      assignedAdvisor: { select: { name: true } },
      assignments: { orderBy: { assignedAt: "desc" }, take: 1, select: { manyChatNotified: true } },
    },
  });
  const advisorName = advisorDisplayName(lead?.assignedAdvisor?.name);
  if (!advisorName) return { status: "no_advisor", advisorName: null, advisorNotified: false };
  return {
    status: conversation.handoffState === "EXISTING_LEAD" ? "existing" : "assigned",
    advisorName,
    advisorNotified: Boolean(lead?.assignments[0]?.manyChatNotified),
  };
}

function describeBudget(facts: Facts): string | null {
  const min = facts.budget_min?.status === "known" ? facts.budget_min.value : null;
  const max = facts.budget_max?.status === "known" ? facts.budget_max.value : null;
  const currency = facts.currency?.status === "known" ? ` ${facts.currency.value}` : "";
  if (min && max) return `${min} – ${max}${currency}`;
  if (max) return `hasta ${max}${currency}`;
  if (min) return `desde ${min}${currency}`;
  return null;
}

/** Propiedades verificadas que el cliente mencionó en la conversación (para el aviso al asesor). */
function mentionedProperties(conversation: Conversation): { publicId: string; title: string | null; url: string | null }[] {
  if (!Array.isArray(conversation.properties)) return [];
  return (conversation.properties as { publicId?: unknown; title?: unknown; url?: unknown; verified?: unknown }[])
    .filter((p) => typeof p.publicId === "string" && p.verified !== false)
    .map((p) => ({
      publicId: p.publicId as string,
      title: typeof p.title === "string" ? p.title : null,
      url: typeof p.url === "string" ? p.url : null,
    }));
}

function known(facts: Facts, key: keyof Facts): string | null {
  const fact = facts[key];
  return fact?.status === "known" ? fact.value : null;
}

/** Lead reciente del mismo teléfono (de cualquier origen real, incluido el flujo anterior). */
async function findRecentLeadForPhone(companyId: string, phone: string, windowDays: number) {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return prisma.lead.findFirst({
    where: { companyId, phone, createdAt: { gte: since }, NOT: { source: "testing_ui" } },
    orderBy: { createdAt: "desc" },
    include: { assignedAdvisor: { select: { name: true } } },
  });
}

/** Qué asesor tocaría, SIN escribir nada (conversaciones de prueba). Misma regla que el motor real. */
async function dryRunAssignment(companyId: string, interesCliente: string, agentEmail: string | null) {
  if (agentEmail && agentEmail.toLowerCase() !== env.easybroker.fallbackAgentEmail) {
    const direct = await findAdvisorByEasyBrokerEmail(companyId, agentEmail);
    if (direct) return { advisorName: direct.name, method: "DIRECT_PROPERTY_ADVISOR" as const };
  }
  const { assignmentRoute } = classifyInterest(interesCliente);
  const { candidates, todayCounts, onRound } = await getRotationCandidatesForSimulation(companyId, assignmentRoute);
  const picked = pickWeightedLeastAssigned(applyRounds(candidates, todayCounts, onRound).pool, todayCounts);
  return picked ? { advisorName: picked.name, method: "WEIGHTED_ROTATION" as const } : null;
}

/** Idempotencia por sesión: reintentos del mismo turno no crean otro lead; una sesión nueva meses después sí puede. */
function handoffRequestId(conversation: Pick<Conversation, "id" | "sessionStartSeq">): string {
  return conversation.sessionStartSeq > 1 ? `conv:${conversation.id}:s${conversation.sessionStartSeq}:handoff` : `conv:${conversation.id}:handoff`;
}

/**
 * Canalización comercial. La IA solo la SOLICITA: aquí se validan
 * intención, propiedad, asignación previa e idempotencia, y se reutiliza
 * processIncomingLead (asesor propio / comodín / ruleta ponderada /
 * restricciones / auditoría / EasyBroker / reintentos / aviso ManyChat)
 * sin tocar sus reglas. Al completarse abre la espera automática.
 */
export async function requestCommercialHandoff(input: {
  conversation: Conversation;
  settings: AssistantSettings;
  primaryIntent: ConversationIntentCode;
  secondaryIntents: ConversationIntentCode[];
  facts: Facts;
  summary: string | null;
  reason: string;
  propertyPublicId: string | null;
  trigger: HandoffTrigger;
}): Promise<CommercialHandoffResult> {
  const { conversation, settings } = input;
  const now = new Date();

  // 1. Ya canalizado en ESTA sesión: no se reasigna en silencio.
  if ((conversation.handoffState === "ASSIGNED" || conversation.handoffState === "EXISTING_LEAD") && handoffInCurrentSession(conversation)) {
    const facts = await loadAssignmentFacts(conversation);
    const followUp = await recordEscalation(
      conversation,
      "FOLLOW_UP",
      `El cliente ya canalizado vuelve a solicitar atención: ${input.reason}${input.propertyPublicId ? ` (propiedad ${input.propertyPublicId})` : ""}`
    );
    return {
      status: "already_assigned",
      advisor_name: facts?.advisorName ?? null,
      follow_up_recorded: Boolean(followUp.id),
      customer_message: facts ? buildAssignmentConfirmation({ ...facts, status: "existing" }) : null,
    };
  }

  // 2. Propiedad: solo se acepta un código verificado contra EasyBroker.
  let propertyId: string | null = null;
  let agentEmail: string | null = null;
  if (input.propertyPublicId) {
    const lookup = await lookupProperty(input.propertyPublicId);
    if (lookup.ok) {
      propertyId = lookup.property.public_id;
      agentEmail = lookup.property.agent?.email ?? null;
    } else if (lookup.error === "easybroker_unavailable") {
      // Igual que el flujo anterior: el motor reintenta la consulta y, si
      // EasyBroker sigue caído, cae a ruleta. No se inventa ni se descarta.
      propertyId = input.propertyPublicId.toUpperCase();
    }
  }

  const decision = decideCommercialHandoff({
    primaryIntent: input.primaryIntent,
    secondaryIntents: input.secondaryIntents,
    verifiedPropertyId: propertyId,
    trigger: input.trigger,
    fromCampaign: Boolean(conversation.campaignRef && propertyId && conversation.campaignRef === propertyId),
  });
  if (!decision.allowed) return { status: "rejected", reason: decision.reason };

  const additionalNeeds = input.secondaryIntents.filter((intent) => intent !== input.primaryIntent).map((i) => INTENT_LABELS[i]);
  const conversationContext = {
    reason: input.reason,
    operation: known(input.facts, "operation") ?? (isRealEstateIntent(input.primaryIntent) ? INTENT_LABELS[input.primaryIntent] : null),
    zone: known(input.facts, "zone") ?? known(input.facts, "own_property_location"),
    budget: describeBudget(input.facts),
    additionalNeeds,
    summary: input.summary,
    // El asesor recibe todo en el aviso; no se le manda al panel.
    otherProperties: mentionedProperties(conversation),
  };
  const wait = waitFields(settings, "commercial", now);

  // 3. Conversación de prueba: se calcula a quién tocaría, sin crear lead,
  // sin mover conteos de la ruleta y sin avisar a nadie.
  if (conversation.isTest) {
    const dryRun = await dryRunAssignment(conversation.companyId, decision.interesCliente, agentEmail);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        handoffState: dryRun ? "ASSIGNED" : "NO_ADVISOR",
        handoffAt: now,
        handoffReason: `SIMULACIÓN (${decision.interesCliente}${propertyId ? ` ${propertyId}` : ""}): ${
          dryRun ? `tocaría a ${dryRun.advisorName} por ${dryRun.method}` : "sin asesores disponibles"
        }. ${input.reason}`.slice(0, 1000),
        ...wait,
        assignmentNoticeAt: null,
      },
    });
    if (!dryRun) {
      return { status: "no_advisor_available", pending_recorded: false, customer_message: buildAssignmentConfirmation({ status: "no_advisor", advisorName: null, advisorNotified: false }) };
    }
    const name = advisorDisplayName(dryRun.advisorName);
    return {
      status: "assigned",
      simulated: true,
      advisor_name: name,
      assignment_recorded: false,
      advisor_notified: false,
      crm_synced: false,
      customer_message: buildAssignmentConfirmation({ status: "assigned", advisorName: name, advisorNotified: false }),
    };
  }

  const phone = conversation.phone;
  if (!phone) {
    await recordEscalation(conversation, "HUMAN", "No se pudo canalizar: ManyChat no envió el teléfono del contacto.");
    return { status: "error", retryable: false };
  }

  // 4. El teléfono ya tiene un lead reciente (p. ej. del flujo anterior o de
  // una sesión anterior): se vincula y se registra la solicitud como
  // seguimiento para su mismo asesor, sin reasignar.
  const recent = await findRecentLeadForPhone(conversation.companyId, phone, settings.existingLeadWindowDays);
  if (recent) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: recent.id, handoffState: "EXISTING_LEAD", handoffAt: now, handoffReason: input.reason.slice(0, 1000), ...wait, assignmentNoticeAt: null },
    });
    const followUp = await recordEscalation(
      conversation,
      "FOLLOW_UP",
      `Cliente con lead existente (${recent.id}) trae una solicitud: ${input.reason}${propertyId ? ` (propiedad ${propertyId})` : ""}`
    );
    await logAuditEvent({
      companyId: conversation.companyId,
      leadId: recent.id,
      eventType: "LEAD_DUPLICATE_SKIPPED",
      status: "skipped",
      message: "El asistente encontró un lead reciente del mismo teléfono; se vinculó la conversación sin reasignar.",
      metadata: { conversationId: conversation.id, propertyId },
    });
    const name = advisorDisplayName(recent.assignedAdvisor?.name);
    return {
      status: "existing_lead",
      advisor_name: name,
      follow_up_recorded: followUp.created,
      customer_message: buildAssignmentConfirmation(name ? { status: "existing", advisorName: name, advisorNotified: false } : { status: "no_advisor", advisorName: null, advisorNotified: false }),
    };
  }

  // 5. Lead nuevo por el motor existente.
  const requestId = handoffRequestId(conversation);
  try {
    const result = await processIncomingLead(
      conversation.companyId,
      {
        nombre: conversation.name?.trim() || "Sin nombre (WhatsApp)",
        telefonoCliente: phone,
        interesCliente: decision.interesCliente,
        datosPropiedad: decision.datosPropiedad,
        origen: conversation.campaignRef ? `${ASSISTANT_ORIGIN} · Campaña ${conversation.campaignRef}` : ASSISTANT_ORIGIN,
        subscriberId: conversation.manyChatSubscriberId,
        requestId,
        conversation: conversationContext,
      },
      { source: "assistant_conversation", requestId, dedupeByPhoneHours: 24 }
    );

    if (!result.selection.ok) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: result.leadId, handoffState: "NO_ADVISOR", handoffAt: now, handoffReason: input.reason.slice(0, 1000), ...wait, assignmentNoticeAt: null },
      });
      await recordEscalation(conversation, "HUMAN", "Sin asesores disponibles para canalizar al cliente.");
      return { status: "no_advisor_available", pending_recorded: true, customer_message: buildAssignmentConfirmation({ status: "no_advisor", advisorName: null, advisorNotified: false }) };
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: result.leadId, handoffState: "ASSIGNED", handoffAt: now, handoffReason: input.reason.slice(0, 1000), ...wait, assignmentNoticeAt: null },
    });
    const name = advisorDisplayName(result.selection.advisorName);
    return {
      status: "assigned",
      simulated: result.mode === "shadow",
      advisor_name: name,
      assignment_recorded: true,
      advisor_notified: result.manyChat.notified,
      crm_synced: result.easyBroker.confirmed,
      customer_message: buildAssignmentConfirmation({ status: "assigned", advisorName: name, advisorNotified: result.manyChat.notified }),
    };
  } catch (error) {
    if (error instanceof DuplicatePhoneLeadError) {
      const existing = await prisma.lead.findUnique({
        where: { id: error.existing.id },
        include: { assignedAdvisor: { select: { name: true } } },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: error.existing.id, handoffState: "EXISTING_LEAD", handoffAt: now, handoffReason: input.reason.slice(0, 1000), ...wait, assignmentNoticeAt: null },
      });
      const name = advisorDisplayName(existing?.assignedAdvisor?.name);
      return {
        status: "existing_lead",
        advisor_name: name,
        follow_up_recorded: false,
        customer_message: buildAssignmentConfirmation(name ? { status: "existing", advisorName: name, advisorNotified: false } : { status: "no_advisor", advisorName: null, advisorNotified: false }),
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const lead = await findLeadByRequestId(requestId);
      if (lead) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { leadId: lead.id, handoffState: lead.assignedAdvisorId ? "ASSIGNED" : "NO_ADVISOR", handoffAt: now, ...wait },
        });
        const facts = await loadAssignmentFacts({ leadId: lead.id, handoffState: lead.assignedAdvisorId ? "ASSIGNED" : "NO_ADVISOR", handoffReason: null, isTest: false });
        return { status: "already_assigned", advisor_name: facts?.advisorName ?? null, follow_up_recorded: false, customer_message: facts ? buildAssignmentConfirmation(facts) : null };
      }
    }
    console.error("[ASSISTANT] handoff comercial falló", error);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { handoffState: "FAILED", handoffReason: `Error al canalizar: ${error instanceof Error ? error.message : "desconocido"}`.slice(0, 1000) },
    });
    await recordEscalation(conversation, "PROCESSING_ERROR", "Falló la canalización comercial automática; revisar y asignar manualmente.");
    return { status: "error", retryable: false };
  }
}

/**
 * Avisa a gerencia usando el mismo flujo de ManyChat de avisos (campos del
 * contacto destinatario + sendFlow). Sin destinatarios configurados, o en
 * modo shadow/prueba, el pendiente queda SOLO en el panel y se reporta
 * como no notificado — nunca se afirma un aviso que no ocurrió.
 */
async function notifyManagement(
  conversation: Conversation,
  settings: AssistantSettings,
  title: string,
  detail: string
): Promise<boolean> {
  if (conversation.isTest || !isLiveAutomation()) return false;
  if (settings.managementSubscriberIds.length === 0 || !env.manychat.advisorFlowId) return false;
  const cleanPhone = (conversation.phone ?? "").replace(/\D/g, "");
  const fields = [
    { fieldId: ADVISOR_LEAD_FIELD_IDS.name, value: conversation.name ?? "Sin nombre" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.phone, value: conversation.phone ?? "Sin teléfono" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.requestType, value: title },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.reference, value: "Gerencia" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.relatedInfo, value: [detail, conversationPanelUrl(conversation.id)].filter(Boolean).join("\n").slice(0, 900) },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.contactUrl, value: cleanPhone ? `https://wa.me/${cleanPhone}` : "" },
  ];
  let anySent = false;
  for (const subscriberId of settings.managementSubscriberIds) {
    try {
      await notifyAdvisor({ advisorManyChatSubscriberId: subscriberId, customFields: fields });
      anySent = true;
    } catch (error) {
      console.error("[ASSISTANT] aviso a gerencia falló", subscriberId, error);
    }
  }
  return anySent;
}

export async function requestManagement(input: {
  conversation: Conversation;
  settings: AssistantSettings;
  category: string;
  reason: string;
  summary: string | null;
}): Promise<{ recorded: true; notified: boolean }> {
  const reason = `[${input.category}] ${input.reason}`;
  const escalation = await recordEscalation(input.conversation, "MANAGEMENT", reason);
  const notified = escalation.created
    ? await notifyManagement(input.conversation, input.settings, `Gerencia: ${input.category}`, `${input.reason}\n${input.summary ?? ""}`)
    : false;
  if (notified) {
    await prisma.conversationEscalation.update({ where: { id: escalation.id }, data: { status: "NOTIFIED", notifiedAt: new Date() } });
  }
  const now = new Date();
  await prisma.conversation.update({
    where: { id: input.conversation.id },
    data: {
      ...(input.conversation.handoffState === "NONE" ? { handoffState: "NOT_APPLICABLE", handoffReason: reason.slice(0, 1000), handoffAt: now } : {}),
      ...waitFields(input.settings, "management", now),
    },
  });
  return { recorded: true, notified };
}

/**
 * El cliente pide una persona. Ya NO se detiene la IA de forma permanente
 * (así Farid quedó atrapado): queda un pendiente HUMAN en el panel, aviso a
 * gerencia si está configurado, y la espera automática de N minutos. Si una
 * persona toma la conversación desde la bandeja de ManyChat, la
 * automatización de ManyChat se pausa y los mensajes no llegan al bot; si
 * además se quiere detener la IA aquí, es la pausa manual del panel.
 */
export async function requestHuman(input: {
  conversation: Conversation;
  settings: AssistantSettings;
  reason: string;
  summary: string | null;
}): Promise<{ recorded: true; notified: boolean }> {
  const escalation = await recordEscalation(input.conversation, "HUMAN", input.reason);
  const notified = escalation.created
    ? await notifyManagement(input.conversation, input.settings, "Solicita atención humana", `${input.reason}\n${input.summary ?? ""}`)
    : false;
  if (notified) {
    await prisma.conversationEscalation.update({ where: { id: escalation.id }, data: { status: "NOTIFIED", notifiedAt: new Date() } });
  }
  await prisma.conversation.update({ where: { id: input.conversation.id }, data: waitFields(input.settings, "human") });
  return { recorded: true, notified };
}
