import "server-only";
import type { IntegrationJob } from "@prisma/client";
import {
  createIntegrationJob,
  findDueJobs,
  markJobSucceeded,
  markJobFailed,
} from "@/lib/repositories/integration-job.repository";
import { updateLead } from "@/lib/repositories/lead.repository";
import { updateAssignmentStatus } from "@/lib/repositories/assignment.repository";
import {
  createContactRequest,
  assignContactToAdvisor,
  findRecentContactRequest,
} from "@/lib/services/easybroker.service";
import { setCustomFields, sendFlow } from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";
import { nextBackoffRetryAt } from "@/lib/retry";

/** Fase 20: 1 min, 5 min, 15 min, 1 h — then FAILED for good, visible in AuditLog. */
const BACKOFF_MINUTES = [1, 5, 15, 60];

export type EasyBrokerCreatePayload = {
  name: string;
  phone: string;
  message: string;
  source: string;
  propertyId?: string;
};
/**
 * `contactId` is often not known yet: EasyBroker's contact_request record
 * can take longer to become queryable than the webhook's own response
 * budget allows (verified — the contact_request itself is always created
 * successfully, GET /contact_requests just doesn't reflect it immediately
 * every time). When absent, the job looks it up by phone/source/propertyId
 * before assigning, same as the synchronous path does.
 */
export type EasyBrokerAssignPayload = {
  contactId?: string;
  phone: string;
  source: string;
  propertyId?: string;
  advisorEmail: string;
  advisorId?: string;
  assignmentId?: string;
};
export type ManyChatFieldsPayload = { subscriberId: string; fields: { fieldId: number; value: string }[] };
export type ManyChatFlowPayload = {
  subscriberId: string;
  flowNs: string;
  fields?: { fieldId: number; value: string }[];
  assignmentId?: string;
};

export async function enqueueEasyBrokerCreate(companyId: string, leadId: string, payload: EasyBrokerCreatePayload) {
  await createIntegrationJob({ companyId, leadId, type: "EASYBROKER_CREATE", payload });
  await logAuditEvent({ companyId, leadId, eventType: "RETRY_SCHEDULED", status: "ok", message: "Reintento programado: crear contact_request en EasyBroker." });
}

export async function enqueueEasyBrokerAssign(companyId: string, leadId: string, payload: EasyBrokerAssignPayload) {
  await createIntegrationJob({ companyId, leadId, type: "EASYBROKER_ASSIGN", payload });
  await logAuditEvent({ companyId, leadId, eventType: "RETRY_SCHEDULED", status: "ok", message: "Reintento programado: asignar asesor en EasyBroker." });
}

export async function enqueueManyChatFlow(companyId: string, leadId: string, payload: ManyChatFlowPayload) {
  await createIntegrationJob({ companyId, leadId, type: "MANYCHAT_FLOW", payload });
  await logAuditEvent({ companyId, leadId, eventType: "RETRY_SCHEDULED", status: "ok", message: "Reintento programado: notificar asesor en ManyChat." });
}

async function runJob(job: IntegrationJob): Promise<void> {
  switch (job.type) {
    case "EASYBROKER_CREATE": {
      const payload = job.payload as unknown as EasyBrokerCreatePayload;
      const result = await createContactRequest(payload);
      if (job.leadId && result.id) {
        await updateLead(job.leadId, { easyBrokerContactRequestId: result.id });
      }
      return;
    }
    case "EASYBROKER_ASSIGN": {
      const payload = job.payload as unknown as EasyBrokerAssignPayload;
      let contactId = payload.contactId;
      if (!contactId) {
        const found = await findRecentContactRequest({
          phone: payload.phone,
          source: payload.source,
          propertyId: payload.propertyId,
        });
        if (!found?.contact_id) {
          throw new Error("El contacto todavía no aparece en EasyBroker; se reintentará.");
        }
        contactId = found.contact_id;
        if (job.leadId) await updateLead(job.leadId, { easyBrokerContactId: contactId });
      }
      await assignContactToAdvisor(contactId, payload.advisorEmail);
      if (payload.assignmentId) {
        await updateAssignmentStatus(payload.assignmentId, { status: "CONFIRMED", easyBrokerConfirmed: true });
      }
      return;
    }
    case "MANYCHAT_FIELDS": {
      const payload = job.payload as unknown as ManyChatFieldsPayload;
      await setCustomFields(payload.subscriberId, payload.fields);
      return;
    }
    case "MANYCHAT_FLOW": {
      const payload = job.payload as unknown as ManyChatFlowPayload;

      // The Flow reads fields stored on the advisor contact. Always restore
      // the fields for THIS job immediately before the Flow so a newer lead
      // cannot overwrite them while this retry is waiting in the queue.
      if (payload.fields && payload.fields.length > 0) {
        await setCustomFields(payload.subscriberId, payload.fields);
      }

      await sendFlow(payload.subscriberId, payload.flowNs);

      if (payload.assignmentId) {
        await updateAssignmentStatus(payload.assignmentId, { manyChatNotified: true });
      }
      return;
    }
  }
}

export interface RetryRunSummary {
  processed: number;
  succeeded: number;
  failed: number;
  rescheduled: number;
}

/** Called by /api/cron/retry-integrations. Never throws — each job's failure is isolated. */
export async function processDueIntegrationJobs(now: Date = new Date()): Promise<RetryRunSummary> {
  const jobs = await findDueJobs(now);
  const summary: RetryRunSummary = { processed: 0, succeeded: 0, failed: 0, rescheduled: 0 };

  for (const job of jobs) {
    summary.processed += 1;
    try {
      await runJob(job);
      await markJobSucceeded(job.id);
      summary.succeeded += 1;
      await logAuditEvent({
        companyId: job.companyId,
        leadId: job.leadId ?? undefined,
        eventType: "INTEGRATION_JOB_RETRIED",
        status: "ok",
        message: `Reintento de ${job.type} exitoso (intento ${job.attempts + 1}).`,
      });
    } catch (error) {
      const attempts = job.attempts + 1;
      const retryAt = nextBackoffRetryAt(attempts, BACKOFF_MINUTES);
      await markJobFailed(job.id, attempts, error instanceof Error ? error.message : "Error desconocido", retryAt);
      if (retryAt) summary.rescheduled += 1;
      else summary.failed += 1;
      await logAuditEvent({
        companyId: job.companyId,
        leadId: job.leadId ?? undefined,
        eventType: "INTEGRATION_JOB_FAILED",
        status: retryAt ? "warning" : "error",
        message: `Reintento de ${job.type} falló (intento ${attempts}${retryAt ? ", se reintentará" : ", máximo de intentos alcanzado"}).`,
      });
    }
  }

  return summary;
}
