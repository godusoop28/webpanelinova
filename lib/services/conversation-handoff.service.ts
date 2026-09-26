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
import { processIncomingLead, DuplicatePhoneLeadError, ADVISOR_LEAD_FIELD_IDS } from "@/lib/services/lead.service";
import { getRotationCandidatesForSimulation } from "@/lib/services/assignment.service";
import { findAdvisorByEasyBrokerEmail } from "@/lib/repositories/advisor.repository";
import { findLeadByRequestId } from "@/lib/repositories/lead.repository";
import { lookupProperty } from "@/lib/services/property-catalog.service";
import { notifyAdvisor } from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";

const ASSISTANT_ORIGIN = "WhatsApp IA";

export type CommercialHandoffResult =
  | {
      status: "assigned";
      simulated: boolean;
      advisor_first_name: string | null;
      /** Asignación local registrada (LeadAssignment). */
      assignment_recorded: boolean;
      /** Aviso al asesor enviado por ManyChat (false = pendiente/reintento). */
      advisor_notified: boolean;
      /** Contacto confirmado en EasyBroker (false = pendiente/reintento). */
      crm_synced: boolean;
    }
  | { status: "already_assigned"; advisor_first_name: string | null; follow_up_recorded: boolean }
  | { status: "existing_lead"; advisor_first_name: string | null; follow_up_recorded: boolean }
  | { status: "no_advisor_available"; pending_recorded: boolean }
  | { status: "rejected"; reason: string }
  | { status: "error"; retryable: boolean };

function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] ?? null;
}

export function conversationPanelUrl(conversationId: string): string | null {
  const base = env.assistant.panelUrl;
  return base ? `${base}/conversaciones/${conversationId}` : null;
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

function describeBudget(facts: Facts): string | null {
  const min = facts.budget_min?.status === "known" ? facts.budget_min.value : null;
  const max = facts.budget_max?.status === "known" ? facts.budget_max.value : null;
  const currency = facts.currency?.status === "known" ? ` ${facts.currency.value}` : "";
  if (min && max) return `${min} – ${max}${currency}`;
  if (max) return `hasta ${max}${currency}`;
  if (min) return `desde ${min}${currency}`;
  return null;
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
  const { candidates, todayCounts } = await getRotationCandidatesForSimulation(companyId, assignmentRoute);
  const picked = pickWeightedLeastAssigned(candidates, todayCounts);
  return picked ? { advisorName: picked.name, method: "WEIGHTED_ROTATION" as const } : null;
}

/**
 * Canalización comercial. La IA solo la SOLICITA: aquí se validan
 * intención, propiedad, asignación previa e idempotencia, y se reutiliza
 * processIncomingLead (asesor propio / comodín / ruleta ponderada /
 * restricciones / auditoría / EasyBroker / reintentos / aviso ManyChat)
 * sin tocar sus reglas.
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

  // 1. Ya canalizado en esta conversación: no se reasigna en silencio.
  if (conversation.handoffState === "ASSIGNED" || conversation.handoffState === "EXISTING_LEAD") {
    const lead = conversation.leadId
      ? await prisma.lead.findUnique({ where: { id: conversation.leadId }, include: { assignedAdvisor: { select: { name: true } } } })
      : null;
    const followUp = await recordEscalation(
      conversation,
      "FOLLOW_UP",
      `El cliente ya canalizado vuelve a solicitar atención: ${input.reason}`
    );
    return {
      status: "already_assigned",
      advisor_first_name: firstName(lead?.assignedAdvisor?.name),
      follow_up_recorded: Boolean(followUp.id),
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
    conversationUrl: conversationPanelUrl(conversation.id),
  };

  // 3. Conversación de prueba: se calcula a quién tocaría, sin crear lead,
  // sin mover conteos de la ruleta y sin avisar a nadie.
  if (conversation.isTest) {
    const dryRun = await dryRunAssignment(conversation.companyId, decision.interesCliente, agentEmail);
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        handoffState: dryRun ? "ASSIGNED" : "NO_ADVISOR",
        handoffAt: new Date(),
        handoffReason: `SIMULACIÓN (${decision.interesCliente}${propertyId ? ` ${propertyId}` : ""}): ${
          dryRun ? `tocaría a ${dryRun.advisorName} por ${dryRun.method}` : "sin asesores disponibles"
        }. ${input.reason}`.slice(0, 1000),
      },
    });
    if (!dryRun) return { status: "no_advisor_available", pending_recorded: false };
    return {
      status: "assigned",
      simulated: true,
      advisor_first_name: firstName(dryRun.advisorName),
      assignment_recorded: false,
      advisor_notified: false,
      crm_synced: false,
    };
  }

  const phone = conversation.phone;
  if (!phone) {
    await recordEscalation(conversation, "HUMAN", "No se pudo canalizar: ManyChat no envió el teléfono del contacto.");
    return { status: "error", retryable: false };
  }

  // 4. El teléfono ya tiene un lead reciente (p. ej. del flujo anterior):
  // se vincula y se registra el seguimiento, sin reasignar.
  const recent = await findRecentLeadForPhone(conversation.companyId, phone, settings.existingLeadWindowDays);
  if (recent) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: recent.id, handoffState: "EXISTING_LEAD", handoffAt: new Date(), handoffReason: input.reason.slice(0, 1000) },
    });
    const followUp = await recordEscalation(
      conversation,
      "FOLLOW_UP",
      `Cliente con lead existente (${recent.id}) escribe de nuevo: ${input.reason}`
    );
    await logAuditEvent({
      companyId: conversation.companyId,
      leadId: recent.id,
      eventType: "LEAD_DUPLICATE_SKIPPED",
      status: "skipped",
      message: "El asistente encontró un lead reciente del mismo teléfono; se vinculó la conversación sin reasignar.",
      metadata: { conversationId: conversation.id },
    });
    return { status: "existing_lead", advisor_first_name: firstName(recent.assignedAdvisor?.name), follow_up_recorded: followUp.created };
  }

  // 5. Lead nuevo por el motor existente. requestId estable por
  // conversación: reintentos del mismo turno no crean otro lead.
  const requestId = `conv:${conversation.id}:handoff`;
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
        data: { leadId: result.leadId, handoffState: "NO_ADVISOR", handoffAt: new Date(), handoffReason: input.reason.slice(0, 1000) },
      });
      await recordEscalation(conversation, "HUMAN", "Sin asesores disponibles para canalizar al cliente.");
      return { status: "no_advisor_available", pending_recorded: true };
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { leadId: result.leadId, handoffState: "ASSIGNED", handoffAt: new Date(), handoffReason: input.reason.slice(0, 1000) },
    });
    return {
      status: "assigned",
      simulated: result.mode === "shadow",
      advisor_first_name: firstName(result.selection.advisorName),
      assignment_recorded: true,
      advisor_notified: result.manyChat.notified,
      crm_synced: result.easyBroker.confirmed,
    };
  } catch (error) {
    if (error instanceof DuplicatePhoneLeadError) {
      const existing = await prisma.lead.findUnique({
        where: { id: error.existing.id },
        include: { assignedAdvisor: { select: { name: true } } },
      });
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadId: error.existing.id, handoffState: "EXISTING_LEAD", handoffAt: new Date(), handoffReason: input.reason.slice(0, 1000) },
      });
      return { status: "existing_lead", advisor_first_name: firstName(existing?.assignedAdvisor?.name), follow_up_recorded: false };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const lead = await findLeadByRequestId(requestId);
      if (lead) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { leadId: lead.id, handoffState: lead.assignedAdvisorId ? "ASSIGNED" : "NO_ADVISOR", handoffAt: new Date() },
        });
        return { status: "already_assigned", advisor_first_name: null, follow_up_recorded: false };
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
  if (input.conversation.handoffState === "NONE") {
    await prisma.conversation.update({
      where: { id: input.conversation.id },
      data: { handoffState: "NOT_APPLICABLE", handoffReason: reason.slice(0, 1000), handoffAt: new Date() },
    });
  }
  return { recorded: true, notified };
}

/**
 * Atención humana en el MISMO número: la IA deja de responder a este
 * contacto (control HUMAN) hasta que alguien la reanude desde el panel.
 * La pausa se aplica después de enviar la respuesta de este turno.
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
  return { recorded: true, notified };
}
