import "server-only";
import type { Lead, LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { findAdvisorById } from "@/lib/repositories/advisor.repository";
import { createAssignmentRecord } from "@/lib/repositories/assignment.repository";
import { updateLead } from "@/lib/repositories/lead.repository";
import { assignContactToAdvisor, EasyBrokerApiError } from "@/lib/services/easybroker.service";
import {
  notifyAdvisor,
  buildAdvisorLeadCustomFields,
  ManyChatApiError,
} from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";
import { isLiveAutomation } from "@/lib/env";

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
  if (!advisor) {
    return { ok: false, easyBrokerUpdated: false, manyChatNotified: false, error: "Asesor no encontrado." };
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
        const advisorLeadFields = buildAdvisorLeadCustomFields({
          name: lead.name,
          phone: lead.phone,
          requestType: lead.interestType === "CAMPAIGN" ? "Campaña" : lead.interestType,
          reference:
            lead.interestType === "CAMPAIGN"
              ? "Campaña propiedad"
              : lead.route || lead.propertyData || lead.interestType,
          relatedInfo: lead.propertyData || "Sin información adicional",
        });

        await notifyAdvisor({
          advisorManyChatSubscriberId: advisor.manyChatSubscriberId,
          customFields: advisorLeadFields,
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
