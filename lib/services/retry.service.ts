import "server-only";
import type { IntegrationJob } from "@prisma/client";
import {
  createIntegrationJob,
  findDueJobs,
  claimJob,
  markJobSucceeded,
  markJobFailed,
  markJobCancelled,
} from "@/lib/repositories/integration-job.repository";
import { updateLead } from "@/lib/repositories/lead.repository";
import { updateAssignmentStatus, findLeadNoticeState, markAssignmentNotified } from "@/lib/repositories/assignment.repository";
import {
  createContactRequest,
  assignContactToAdvisor,
  findRecentContactRequest,
} from "@/lib/services/easybroker.service";
import { setCustomFields, sendFlow } from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";
import { nextBackoffRetryAt } from "@/lib/retry";
import {
  classifyManyChatFailure,
  ManyChatApiError,
  ManyChatConfigError,
  ManyChatNetworkError,
  ManyChatTimeoutError,
  type ManyChatFailure,
} from "@/lib/integrations/manychat-errors";
import { failureAuditMessage, type JobStatus } from "@/lib/integration-notice";
import { fitAdvisorLeadFields } from "@/lib/advisor-notice";

/** Fase 20: 1 min, 5 min, 15 min, 1 h — then FAILED for good, visible in AuditLog. Only for recoverable errors. */
export const BACKOFF_MINUTES = [1, 5, 15, 60];

/** How long a claimed job stays invisible to other cron runs — well past any single job's runtime. */
const JOB_LEASE_MS = 10 * 60 * 1000;

export type EasyBrokerCreatePayload = {
  name: string;
  phone: string;
  message: string;
  source: string;
  propertyId?: string;
  /**
   * The advisor to confirm in EasyBroker once the contact exists. The
   * synchronous path only assigns after a successful create, so a failed
   * create must carry this forward or the contact ends up with no agent.
   */
  assign?: { advisorEmail: string; advisorId?: string; assignmentId?: string };
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
/**
 * Aviso al asesor. `advisorId`/`assignmentId` existen en los trabajos
 * nuevos; los antiguos se resuelven con la asignación vigente del lead.
 */
export type ManyChatFlowPayload = {
  subscriberId: string;
  flowNs: string;
  fields?: { fieldId: number; value: string }[];
  advisorId?: string;
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

/**
 * Registra el aviso al asesor que falló en el pipeline síncrono con su
 * clasificación real: solo un fallo recuperable queda en la cola; uno
 * permanente queda FAILED (requiere revisión) y uno incierto UNCERTAIN,
 * sin reintentos automáticos que no van a funcionar o podrían duplicar.
 */
export async function enqueueManyChatFlow(companyId: string, leadId: string, payload: ManyChatFlowPayload, firstError: unknown) {
  const now = new Date();
  const failure = classifyFailure("MANYCHAT_FLOW", firstError);
  const outcome = decideOutcome(failure, 1, now);
  const job = await createIntegrationJob({
    companyId,
    leadId,
    type: "MANYCHAT_FLOW",
    payload,
    status: outcome.status,
    attempts: 1,
    lastError: failure.reason,
    errorKind: failure.kind,
    errorCode: failure.code,
    lastAttemptAt: now,
    nextRetryAt: outcome.nextRetryAt ?? now,
  });
  await logAuditEvent({
    companyId,
    leadId,
    advisorId: payload.advisorId,
    eventType: outcome.status === "RETRYING" ? "RETRY_SCHEDULED" : "INTEGRATION_JOB_FAILED",
    status: outcome.status === "RETRYING" ? "warning" : "error",
    message: failureAuditMessage({ type: "MANYCHAT_FLOW", status: outcome.status, errorKind: failure.kind, errorCode: failure.code, reason: failure.reason, attempts: 1, nextRetryAt: outcome.nextRetryAt }),
    metadata: { jobId: job.id, errorKind: failure.kind, errorCode: failure.code },
  });
}

function endpointOf(error: unknown): string | undefined {
  if (error instanceof ManyChatApiError) return error.endpoint;
  if (error instanceof ManyChatTimeoutError || error instanceof ManyChatNetworkError) return error.path;
  return undefined;
}

/**
 * ManyChat: se clasifica según HTTP + cuerpo. Escribir Custom Fields es
 * idempotente; un timeout en sendFlow (o sin endpoint conocido) es
 * incierto. EasyBroker conserva su comportamiento previo: todo fallo es
 * recuperable hasta agotar intentos.
 */
export function classifyFailure(type: IntegrationJob["type"], error: unknown): ManyChatFailure {
  if (type === "MANYCHAT_FLOW" || type === "MANYCHAT_FIELDS") {
    const idempotent = type === "MANYCHAT_FIELDS" || !(endpointOf(error) ?? "/sending/").includes("/sending/");
    return classifyManyChatFailure(error, { idempotent });
  }
  const message = error instanceof Error ? error.message : "Error desconocido";
  return { kind: "PROVIDER", retryable: true, uncertain: false, code: "EASYBROKER", reason: message.slice(0, 300), retryAfterMs: null };
}

/** Espera progresiva solo para errores recuperables; respeta Retry-After si pide esperar más. */
export function decideOutcome(
  failure: ManyChatFailure,
  attempts: number,
  now: Date = new Date()
): { status: Extract<JobStatus, "RETRYING" | "FAILED" | "UNCERTAIN">; nextRetryAt: Date | null } {
  if (failure.uncertain) return { status: "UNCERTAIN", nextRetryAt: null };
  if (!failure.retryable) return { status: "FAILED", nextRetryAt: null };
  const backoff = nextBackoffRetryAt(attempts, BACKOFF_MINUTES, now);
  if (!backoff) return { status: "FAILED", nextRetryAt: null };
  const retryAfter = failure.retryAfterMs != null ? new Date(now.getTime() + failure.retryAfterMs) : null;
  return { status: "RETRYING", nextRetryAt: retryAfter && retryAfter > backoff ? retryAfter : backoff };
}

type JobResult = { kind: "done"; message?: string } | { kind: "cancelled"; reason: string };

/**
 * Solo el paso pendiente: reescribe los campos de ESTE lead en el contacto
 * del asesor y lanza el flujo. Nunca crea lead, mueve la ruleta, cambia el
 * asesor ni toca EasyBroker.
 */
async function runManyChatFlow(job: IntegrationJob): Promise<JobResult> {
  const payload = job.payload as unknown as ManyChatFlowPayload;
  let assignmentId = payload.assignmentId;
  if (job.leadId) {
    const state = await findLeadNoticeState(job.leadId);
    if (!state) return { kind: "cancelled", reason: "El lead ya no existe; el aviso pendiente se descarta." };
    if (state.assignedAdvisorSubscriberId !== payload.subscriberId) {
      return { kind: "cancelled", reason: "El lead ya tiene otro asesor asignado; el aviso pendiente al asesor anterior se descarta." };
    }
    const assignment = state.assignment && state.assignment.advisorId === state.assignedAdvisorId ? state.assignment : null;
    if (assignment?.manyChatNotified) {
      return { kind: "cancelled", reason: "El aviso al asesor ya estaba confirmado; no se reenvía." };
    }
    assignmentId ??= assignment?.id;
  }
  if (!payload.flowNs) {
    throw new ManyChatConfigError("MANYCHAT_ADVISOR_FLOW_ID", "Falta MANYCHAT_ADVISOR_FLOW_ID: no hay flujo configurado para avisar al asesor.");
  }
  // El flow del asesor usa Custom Fields del propio asesor: reescribir
  // primero los datos de ESTE lead evita que el retry mande el lead anterior.
  // Los trabajos antiguos traen el texto largo (hasta 1000 caracteres) que
  // excedía el cuerpo de la plantilla: se ajusta antes de reenviar.
  if (payload.fields?.length) {
    await setCustomFields(payload.subscriberId, fitAdvisorLeadFields(payload.fields));
  }
  await sendFlow(payload.subscriberId, payload.flowNs);
  // ManyChat ya aceptó el envío: un fallo local al anotarlo no debe convertir
  // el trabajo en fallido (una recuperación posterior lo duplicaría).
  if (job.leadId && assignmentId) {
    try {
      await markAssignmentNotified(job.leadId, assignmentId);
    } catch (error) {
      console.error("[RETRY] aviso enviado pero no se pudo marcar la asignación", job.id, error);
    }
  }
  return { kind: "done", message: "Aviso al asesor recuperado: ManyChat aceptó el flujo." };
}

async function runJob(job: IntegrationJob): Promise<JobResult> {
  switch (job.type) {
    case "EASYBROKER_CREATE": {
      const payload = job.payload as unknown as EasyBrokerCreatePayload;
      const { assign, ...createInput } = payload;
      const result = await createContactRequest(createInput);
      if (job.leadId && result.id) {
        await updateLead(job.leadId, { easyBrokerContactRequestId: result.id });
      }
      if (assign && job.leadId) {
        await enqueueEasyBrokerAssign(job.companyId, job.leadId, {
          phone: payload.phone,
          source: payload.source,
          propertyId: payload.propertyId,
          ...assign,
        });
      }
      return { kind: "done" };
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
      return { kind: "done" };
    }
    case "MANYCHAT_FIELDS": {
      const payload = job.payload as unknown as ManyChatFieldsPayload;
      await setCustomFields(payload.subscriberId, payload.fields);
      return { kind: "done" };
    }
    case "MANYCHAT_FLOW":
      return runManyChatFlow(job);
  }
}

export interface RetryRunSummary {
  processed: number;
  succeeded: number;
  failed: number;
  rescheduled: number;
  uncertain: number;
  cancelled: number;
}

/**
 * Called by /api/cron/retry-integrations. Never throws — each job's failure
 * is isolated. Only PENDING/RETRYING jobs are picked up and each is leased
 * atomically, so a confirmed job never runs again and two overlapping runs
 * never execute the same job.
 */
export async function processDueIntegrationJobs(now: Date = new Date()): Promise<RetryRunSummary> {
  const jobs = await findDueJobs(now);
  const summary: RetryRunSummary = { processed: 0, succeeded: 0, failed: 0, rescheduled: 0, uncertain: 0, cancelled: 0 };

  for (const job of jobs) {
    if (!(await claimJob(job, new Date(Date.now() + JOB_LEASE_MS)))) continue;
    summary.processed += 1;
    const attempts = job.attempts + 1;
    let result: JobResult;
    try {
      result = await runJob(job);
    } catch (error) {
      const failure = classifyFailure(job.type, error);
      const outcome = decideOutcome(failure, attempts);
      await markJobFailed(job.id, {
        attempts,
        status: outcome.status,
        lastError: failure.reason,
        errorKind: failure.kind,
        errorCode: failure.code,
        nextRetryAt: outcome.nextRetryAt,
      });
      if (outcome.status === "RETRYING") summary.rescheduled += 1;
      else if (outcome.status === "UNCERTAIN") summary.uncertain += 1;
      else summary.failed += 1;
      await logAuditEvent({
        companyId: job.companyId,
        leadId: job.leadId ?? undefined,
        eventType: "INTEGRATION_JOB_FAILED",
        status: outcome.status === "RETRYING" ? "warning" : "error",
        message: failureAuditMessage({ type: job.type, status: outcome.status, errorKind: failure.kind, errorCode: failure.code, reason: failure.reason, attempts, nextRetryAt: outcome.nextRetryAt }),
        metadata: { jobId: job.id, errorKind: failure.kind, errorCode: failure.code },
      });
      continue;
    }

    if (result.kind === "cancelled") {
      await markJobCancelled(job.id, result.reason);
      summary.cancelled += 1;
      await logAuditEvent({ companyId: job.companyId, leadId: job.leadId ?? undefined, eventType: "INTEGRATION_JOB_RETRIED", status: "skipped", message: result.reason, metadata: { jobId: job.id } });
      continue;
    }

    await markJobSucceeded(job.id, attempts);
    summary.succeeded += 1;
    await logAuditEvent({
      companyId: job.companyId,
      leadId: job.leadId ?? undefined,
      eventType: job.type === "MANYCHAT_FLOW" ? "MANYCHAT_NOTIFICATION_SENT" : "INTEGRATION_JOB_RETRIED",
      status: "ok",
      message: result.message ?? `Reintento de ${job.type} exitoso (intento ${attempts}).`,
      metadata: { jobId: job.id },
    });
  }

  return summary;
}
