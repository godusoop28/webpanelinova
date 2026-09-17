import "server-only";
import type { Advisor, AssignmentMethod, Lead, LeadInterestType } from "@prisma/client";
import { env, isLiveAutomation } from "@/lib/env";
import { normalizePhoneE164 } from "@/lib/phone";
import { createLead, updateLead } from "@/lib/repositories/lead.repository";
import { findAdvisorByEasyBrokerEmail } from "@/lib/repositories/advisor.repository";
import {
  selectAndAssignAdvisor,
  assignDirectAdvisor,
  type AssignmentRoute,
  type CandidateSnapshot,
} from "@/lib/services/assignment.service";
import {
  getProperty,
  createContactRequest,
  findRecentContactRequest,
  assignContactToAdvisor,
  EasyBrokerApiError,
  type EasyBrokerProperty,
} from "@/lib/services/easybroker.service";
import { notifyAdvisor, ManyChatApiError } from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";
import { updateAssignmentStatus } from "@/lib/repositories/assignment.repository";

const MANYCHAT_SOURCE = "WhatsApp ManyChat";
// Matches EasyBroker's Make scenario pattern (?<codigo>EB-[A-Za-z0-9-]+) —
// no named group here since tsconfig targets ES2017 (Fase 42: keep the
// diff minimal, don't bump the project-wide build target for this).
const CAMPAIGN_PROPERTY_CODE_PATTERN = /EB-[A-Za-z0-9-]+/;

export interface IncomingLeadInput {
  nombre: string;
  telefonoCliente: string;
  interesCliente: string;
  datosPropiedad?: string;
  origen?: string;
  subscriberId?: string;
  requestId?: string;
}

interface RouteClassification {
  interestType: LeadInterestType;
  routeLabel: string;
  assignmentRoute: AssignmentRoute;
}

/**
 * Classifies the free-text `interes_cliente` ManyChat/Make already sends
 * into our controlled types. Kept liberal (substring match) on purpose —
 * the chat flow's exact wording has drifted before and will again; a
 * strict enum here would silently misroute leads instead of failing loudly.
 */
function classifyInterest(raw: string): RouteClassification {
  const normalized = raw.trim().toLowerCase();
  if (normalized.includes("propiedad")) {
    return { interestType: "PROPERTY", routeLabel: "Vi una propiedad", assignmentRoute: "PROPERTY" };
  }
  if (normalized.includes("campa")) {
    return { interestType: "CAMPAIGN", routeLabel: "Campaña propiedad", assignmentRoute: "CAMPAIGN" };
  }
  if (normalized.includes("timeout")) {
    return { interestType: "TIMEOUT", routeLabel: "Timeout", assignmentRoute: "TIMEOUT" };
  }
  if (normalized.includes("sin respuesta")) {
    return { interestType: "NO_RESPONSE", routeLabel: "Explorar opciones", assignmentRoute: "EXPLORE" };
  }
  if (normalized.includes("explor")) {
    return { interestType: "EXPLORE", routeLabel: "Explorar opciones", assignmentRoute: "EXPLORE" };
  }
  return { interestType: "OTHER", routeLabel: "Explorar opciones", assignmentRoute: "EXPLORE" };
}

export function extractCampaignPropertyCode(text: string): string | null {
  return CAMPAIGN_PROPERTY_CODE_PATTERN.exec(text)?.[0] ?? null;
}

export interface ProcessLeadResult {
  mode: "shadow" | "live";
  duplicate: boolean;
  leadId: string;
  routeLabel: string;
  interestType: LeadInterestType;
  property: { publicId: string; title: string; agentEmail?: string } | null;
  selection:
    | {
        ok: true;
        advisorId: string;
        advisorName: string;
        method: AssignmentMethod;
        weight: number;
        reason: string;
        candidatesConsidered: CandidateSnapshot[];
      }
    | { ok: false; error: "NO_ADVISORS_AVAILABLE"; candidatesConsidered: CandidateSnapshot[] };
  actions: string[];
  easyBroker: { contactRequestId: string | null; contactId: string | null; confirmed: boolean };
  manyChat: { notified: boolean };
}

/**
 * Resolves who gets a PROPERTY/CAMPAIGN lead: the property's own agent if
 * EasyBroker reports one that isn't the wildcard fallback email, otherwise
 * the weighted rotation. An agent whose email doesn't match any DB Advisor
 * yet falls back to rotation too — logged, but the lead is never dropped
 * (Fase 16: "NO perder el lead").
 */
async function resolvePropertyAdvisor(
  companyId: string,
  leadId: string,
  property: EasyBrokerProperty,
  assignmentRoute: AssignmentRoute,
  method: Extract<AssignmentMethod, "DIRECT_PROPERTY_ADVISOR" | "CAMPAIGN_DIRECT">
) {
  const agentEmail = property.agent?.email?.trim().toLowerCase();

  if (agentEmail && agentEmail !== env.easybroker.fallbackAgentEmail) {
    const advisor = await findAdvisorByEasyBrokerEmail(companyId, agentEmail);
    if (advisor) {
      const assignment = await assignDirectAdvisor({
        leadId,
        advisorId: advisor.id,
        advisorWeight: advisor.weight,
        method,
        reason: `Asesor propio de la propiedad ${property.public_id} (${agentEmail}).`,
      });
      await logAuditEvent({
        companyId,
        leadId,
        advisorId: advisor.id,
        eventType: "ADVISOR_DIRECT_MATCH",
        status: "ok",
        message: `Asignación directa a ${advisor.name} por ser agente EasyBroker de la propiedad.`,
      });
      return { assignment, advisor, candidatesConsidered: [] as CandidateSnapshot[] };
    }

    await logAuditEvent({
      companyId,
      leadId,
      eventType: "ADVISOR_DIRECT_MATCH",
      status: "warning",
      message: `La propiedad ${property.public_id} tiene agente EasyBroker "${agentEmail}" sin Advisor correspondiente en la base de datos. Cae a ruleta ponderada.`,
    });
  }

  const result = await selectAndAssignAdvisor({
    companyId,
    leadId,
    route: assignmentRoute,
    method: "WEIGHTED_ROTATION",
  });
  if (!result.ok) return { assignment: null, advisor: null, candidatesConsidered: result.candidatesConsidered };
  return { assignment: result.assignment, advisor: result.advisor, candidatesConsidered: result.candidatesConsidered };
}

/**
 * The single pipeline behind /api/webhooks/manychat/lead and the /testing
 * simulator (Fase 16/20/21/27). AUTOMATION_MODE gates every external write:
 * in "shadow" the Lead + LeadAssignment rows are real (so the engine is
 * genuinely exercised end to end), but EasyBroker/ManyChat are never
 * called — only reported as "would_*" actions.
 */
export async function processIncomingLead(
  companyId: string,
  input: IncomingLeadInput,
  context: { source: string; requestId: string; automationMode?: "shadow" | "live" }
): Promise<ProcessLeadResult> {
  const mode = context.automationMode ?? (isLiveAutomation() ? "live" : "shadow");
  const phone = normalizePhoneE164(input.telefonoCliente) || input.telefonoCliente.trim();
  const { interestType, routeLabel, assignmentRoute } = classifyInterest(input.interesCliente);

  const lead: Lead = await createLead({
    companyId,
    name: input.nombre.trim(),
    phone,
    interestType,
    propertyData: input.datosPropiedad || null,
    origin: input.origen || null,
    route: routeLabel,
    status: "PROCESSING",
    source: context.source,
    manyChatSubscriberId: input.subscriberId || null,
    assignmentStatus: "PENDING",
    requestId: context.requestId,
    rawPayload: input as never,
  });

  await logAuditEvent({
    companyId,
    leadId: lead.id,
    eventType: "LEAD_RECEIVED",
    status: "ok",
    message: `Lead recibido: ${routeLabel} (${context.source}).`,
    metadata: { interestType, origin: input.origen },
  });

  const actions: string[] = [];
  let property: EasyBrokerProperty | null = null;
  let propertyPublicId: string | undefined;

  if (assignmentRoute === "PROPERTY") {
    propertyPublicId = input.datosPropiedad?.trim();
  } else if (assignmentRoute === "CAMPAIGN") {
    propertyPublicId = extractCampaignPropertyCode(input.datosPropiedad ?? "") ?? undefined;
  }

  if (propertyPublicId) {
    try {
      property = await getProperty(propertyPublicId);
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        eventType: "PROPERTY_FETCHED",
        status: "ok",
        message: `Propiedad ${propertyPublicId} obtenida de EasyBroker.`,
      });
    } catch (error) {
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        eventType: "PROPERTY_FETCH_FAILED",
        status: "error",
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  let selectionResolved: Awaited<ReturnType<typeof resolvePropertyAdvisor>>;
  if (property) {
    selectionResolved = await resolvePropertyAdvisor(
      companyId,
      lead.id,
      property,
      assignmentRoute,
      assignmentRoute === "CAMPAIGN" ? "CAMPAIGN_DIRECT" : "DIRECT_PROPERTY_ADVISOR"
    );
  } else {
    const rotation = await selectAndAssignAdvisor({
      companyId,
      leadId: lead.id,
      route: assignmentRoute,
      method: "WEIGHTED_ROTATION",
    });
    selectionResolved = rotation.ok
      ? { assignment: rotation.assignment, advisor: rotation.advisor, candidatesConsidered: rotation.candidatesConsidered }
      : { assignment: null, advisor: null, candidatesConsidered: rotation.candidatesConsidered };
    if (rotation.ok) {
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        advisorId: rotation.advisor.id,
        eventType: "ADVISOR_ROTATION_SELECTED",
        status: "ok",
        message: `${rotation.advisor.name} seleccionado por ruleta ponderada.`,
        metadata: { candidatesConsidered: rotation.candidatesConsidered },
      });
    }
  }

  const { assignment, advisor, candidatesConsidered } = selectionResolved;

  if (!advisor || !assignment) {
    await logAuditEvent({
      companyId,
      leadId: lead.id,
      eventType: "ADVISOR_SELECTION_FAILED",
      status: "error",
      message: `Sin asesores disponibles para la ruta "${routeLabel}".`,
      metadata: { candidatesConsidered },
    });
    await updateLead(lead.id, { status: "FAILED", assignmentStatus: "FAILED" });
    return {
      mode,
      duplicate: false,
      leadId: lead.id,
      routeLabel,
      interestType,
      property: property ? { publicId: property.public_id, title: property.title, agentEmail: property.agent?.email } : null,
      selection: { ok: false, error: "NO_ADVISORS_AVAILABLE", candidatesConsidered },
      actions: [],
      easyBroker: { contactRequestId: null, contactId: null, confirmed: false },
      manyChat: { notified: false },
    };
  }

  await updateLead(lead.id, { assignedAdvisorId: advisor.id, assignmentStatus: "ASSIGNED", status: "ASSIGNED" });

  const selection = {
    ok: true as const,
    advisorId: advisor.id,
    advisorName: advisor.name,
    method: assignment.method,
    weight: assignment.weightAtAssignment,
    reason: assignment.reason ?? "",
    candidatesConsidered,
  };

  if (mode === "shadow") {
    actions.push("would_create_easybroker_contact", "would_assign_advisor", "would_notify_manychat");
    await logAuditEvent({
      companyId,
      leadId: lead.id,
      advisorId: advisor.id,
      eventType: "SHADOW_ACTION_SKIPPED",
      status: "skipped",
      message: "AUTOMATION_MODE=shadow: no se llamó a EasyBroker ni a ManyChat.",
    });
    return {
      mode,
      duplicate: false,
      leadId: lead.id,
      routeLabel,
      interestType,
      property: property ? { publicId: property.public_id, title: property.title, agentEmail: property.agent?.email } : null,
      selection,
      actions,
      easyBroker: { contactRequestId: null, contactId: null, confirmed: false },
      manyChat: { notified: false },
    };
  }

  // --- live mode from here on: real EasyBroker + ManyChat calls ---
  let contactRequestId: string | null = null;
  let contactId: string | null = null;
  let confirmed = false;

  try {
    const contactRequest = await createContactRequest({
      name: input.nombre,
      phone,
      message: property
        ? `Lead recibido desde WhatsApp. El cliente vio la propiedad ${property.public_id}.\n\nDato enviado: ${input.datosPropiedad ?? ""}\nInterés: ${input.interesCliente}\nOrigen: ${MANYCHAT_SOURCE}`
        : `Lead recibido desde WhatsApp. Interés: ${input.interesCliente}. Ref: ${context.requestId}`,
      source: MANYCHAT_SOURCE,
      propertyId: property?.public_id,
    });
    contactRequestId = contactRequest.id ?? null;
    actions.push("created_easybroker_contact");
    await updateLead(lead.id, { easyBrokerContactRequestId: contactRequestId, status: "CREATED_IN_EASYBROKER" });
    await logAuditEvent({
      companyId,
      leadId: lead.id,
      advisorId: advisor.id,
      eventType: "EASYBROKER_CONTACT_REQUEST_CREATED",
      status: "ok",
      message: `contact_request ${contactRequestId ?? "(sin id)"} creado en EasyBroker.`,
    });
  } catch (error) {
    actions.push("easybroker_contact_failed");
    await logAuditEvent({
      companyId,
      leadId: lead.id,
      advisorId: advisor.id,
      eventType: "EASYBROKER_CONTACT_REQUEST_FAILED",
      status: "error",
      message: error instanceof EasyBrokerApiError ? error.message : error instanceof Error ? error.message : "Error desconocido",
    });
  }

  if (contactRequestId) {
    const found = await findRecentContactRequest({ phone, source: MANYCHAT_SOURCE, propertyId: property?.public_id });
    if (found?.contact_id) {
      contactId = found.contact_id;
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        advisorId: advisor.id,
        eventType: "EASYBROKER_CONTACT_FOUND",
        status: "ok",
        message: `Contacto ${contactId} localizado en EasyBroker.`,
      });
      try {
        await assignContactToAdvisor(contactId, advisor.easyBrokerEmail ?? "");
        confirmed = true;
        actions.push("assigned_advisor_in_easybroker");
        await logAuditEvent({
          companyId,
          leadId: lead.id,
          advisorId: advisor.id,
          eventType: "EASYBROKER_CONTACT_ASSIGNED",
          status: "ok",
          message: `Asesor ${advisor.name} confirmado en EasyBroker para el contacto ${contactId}.`,
        });
      } catch (error) {
        actions.push("easybroker_assignment_failed");
        await logAuditEvent({
          companyId,
          leadId: lead.id,
          advisorId: advisor.id,
          eventType: "EASYBROKER_ASSIGNMENT_FAILED",
          status: "error",
          message: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    } else {
      actions.push("easybroker_contact_not_found");
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        advisorId: advisor.id,
        eventType: "EASYBROKER_CONTACT_NOT_FOUND",
        status: "warning",
        message: "No se encontró el contact_request tras el polling; la asignación local se conserva para reintento manual.",
      });
    }
  }

  await updateAssignmentStatus(assignment.id, { status: confirmed ? "CONFIRMED" : "ASSIGNED", easyBrokerConfirmed: confirmed });

  let notified = false;
  if (advisor.manyChatSubscriberId) {
    try {
      await notifyAdvisor({ advisorManyChatSubscriberId: advisor.manyChatSubscriberId });
      notified = true;
      actions.push("notified_manychat");
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        advisorId: advisor.id,
        eventType: "MANYCHAT_NOTIFICATION_SENT",
        status: "ok",
        message: `Asesor ${advisor.name} notificado por ManyChat.`,
      });
    } catch (error) {
      actions.push("manychat_notification_failed");
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        advisorId: advisor.id,
        eventType: "MANYCHAT_NOTIFICATION_FAILED",
        status: "error",
        message: error instanceof ManyChatApiError ? error.message : error instanceof Error ? error.message : "Error desconocido",
      });
    }
  } else {
    await logAuditEvent({
      companyId,
      leadId: lead.id,
      advisorId: advisor.id,
      eventType: "MANYCHAT_NOTIFICATION_FAILED",
      status: "skipped",
      message: `${advisor.name} no tiene manyChatSubscriberId configurado; no se pudo notificar.`,
    });
  }

  await updateAssignmentStatus(assignment.id, { manyChatNotified: notified });
  await updateLead(lead.id, { status: notified ? "COMPLETED" : "NOTIFIED" });
  await logAuditEvent({
    companyId,
    leadId: lead.id,
    advisorId: advisor.id,
    eventType: "LEAD_COMPLETED",
    status: "ok",
    message: `Pipeline terminado. EasyBroker confirmado=${confirmed}, ManyChat notificado=${notified}.`,
  });

  return {
    mode,
    duplicate: false,
    leadId: lead.id,
    routeLabel,
    interestType,
    property: property ? { publicId: property.public_id, title: property.title, agentEmail: property.agent?.email } : null,
    selection,
    actions,
    easyBroker: { contactRequestId, contactId, confirmed },
    manyChat: { notified },
  };
}

export type { Advisor };
