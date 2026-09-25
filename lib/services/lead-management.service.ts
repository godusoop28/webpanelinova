import "server-only";
import type { Lead, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findAdvisorById } from "@/lib/repositories/advisor.repository";
import { createAssignmentRecord } from "@/lib/repositories/assignment.repository";
import { updateLead } from "@/lib/repositories/lead.repository";
import { assignContactToAdvisor, EasyBrokerApiError } from "@/lib/services/easybroker.service";
import { notifyAdvisor, ManyChatApiError } from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";
import { isLiveAutomation } from "@/lib/env";
import { buildAdvisorLeadFields } from "@/lib/services/lead.service";
import { extractCampaignPropertyCode } from "@/lib/campaign-code";

/** Same fields the webhook pipeline writes, rebuilt from the stored Lead (no EasyBroker re-fetch). */
function buildReassignLeadFields(lead: Lead) {
  const raw = (lead.rawPayload ?? {}) as { interesCliente?: unknown };
  const propertyPublicId =
    lead.interestType === "PROPERTY"
      ? lead.propertyData?.trim() || undefined
      : lead.interestType === "CAMPAIGN"
        ? extractCampaignPropertyCode(lead.propertyData ?? "") ?? undefined
        : undefined;
  return buildAdvisorLeadFields({
    name: lead.name,
    phone: lead.phone,
    interest: typeof raw.interesCliente === "string" ? raw.interesCliente : "",
    routeLabel: lead.route ?? "",
    propertyPublicId,
    propertyData: lead.propertyData ?? undefined,
  });
}

export async function updateLeadStatus(leadId: string, status: LeadStatus): Promise<Lead> {
  const lead = await updateLead(leadId, { status });
  await logAuditEvent({
    companyId: lead.companyId,
    leadId: lead.id,
    eventType: "LEAD_STATUS_CHANGED",
    status: "ok",
    message: `Estado cambiado a ${status}.`,
  });
  return lead;
}

export interface ReassignResult {
  ok: boolean;
  easyBrokerUpdated: boolean;
  manyChatNotified: boolean;
  error?: string;
}

/**
 * Manual reassignment from the panel (Fase 14): records the new
 * LeadAssignment, tries to update EasyBroker's contact record and notify
 * the new advisor via ManyChat when in live mode, and audits every step.
 * Never throws — EasyBroker/ManyChat failures are reported back but don't
 * block the reassignment itself from being saved.
 */
export async function reassignLead(
  leadId: string,
  advisorId: string,
  reason: string | undefined
): Promise<ReassignResult> {
  const [lead, advisor] = await Promise.all([
    prisma.lead.findUniqueOrThrow({ where: { id: leadId } }),
    findAdvisorById(advisorId),
  ]);
  if (!advisor || advisor.companyId !== lead.companyId) {
    return { ok: false, easyBrokerUpdated: false, manyChatNotified: false, error: "Asesor no encontrado." };
  }
  if (!advisor.active) {
    return { ok: false, easyBrokerUpdated: false, manyChatNotified: false, error: "El asesor está inactivo." };
  }

  await createAssignmentRecord(prisma, {
    leadId,
    advisorId,
    method: "MANUAL",
    weightAtAssignment: advisor.weight,
    reason: reason || "Reasignación manual desde el panel.",
    status: "ASSIGNED",
  });
  await updateLead(leadId, { assignedAdvisorId: advisorId, assignmentStatus: "ASSIGNED" });
  await logAuditEvent({
    companyId: lead.companyId,
    leadId,
    advisorId,
    eventType: "LEAD_REASSIGNED",
    status: "ok",
    message: `Lead reasignado manualmente a ${advisor.name}.`,
  });

  let easyBrokerUpdated = false;
  let manyChatNotified = false;

  if (isLiveAutomation()) {
    if (lead.easyBrokerContactId && advisor.easyBrokerEmail) {
      try {
        await assignContactToAdvisor(lead.easyBrokerContactId, advisor.easyBrokerEmail);
        easyBrokerUpdated = true;
        await logAuditEvent({
          companyId: lead.companyId,
          leadId,
          advisorId,
          eventType: "EASYBROKER_CONTACT_ASSIGNED",
          status: "ok",
          message: `EasyBroker actualizado tras reasignación manual.`,
        });
      } catch (error) {
        await logAuditEvent({
          companyId: lead.companyId,
          leadId,
          advisorId,
          eventType: "EASYBROKER_ASSIGNMENT_FAILED",
          status: "error",
          message: error instanceof EasyBrokerApiError ? error.message : "Error desconocido al actualizar EasyBroker.",
        });
      }
    }

    if (advisor.manyChatSubscriberId) {
      try {
        // El flow del asesor lee sus Custom Fields: hay que reescribirlos con
        // ESTE lead o el nuevo asesor recibe los datos del último lead que tuvo.
        await notifyAdvisor({
          advisorManyChatSubscriberId: advisor.manyChatSubscriberId,
          customFields: buildReassignLeadFields(lead),
        });
        manyChatNotified = true;
        await logAuditEvent({
          companyId: lead.companyId,
          leadId,
          advisorId,
          eventType: "MANYCHAT_NOTIFICATION_SENT",
          status: "ok",
          message: `Asesor notificado tras reasignación manual.`,
        });
      } catch (error) {
        await logAuditEvent({
          companyId: lead.companyId,
          leadId,
          advisorId,
          eventType: "MANYCHAT_NOTIFICATION_FAILED",
          status: "error",
          message: error instanceof ManyChatApiError ? error.message : "Error desconocido al notificar por ManyChat.",
        });
      }
    }
  }

  return { ok: true, easyBrokerUpdated, manyChatNotified };
}
