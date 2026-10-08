import "server-only";
import { prisma } from "@/lib/db";
import { requeueJob, markJobCancelled } from "@/lib/repositories/integration-job.repository";
import { logAuditEvent } from "@/lib/services/audit.service";
import { categorizeRecovery, CLOSABLE, REQUEUEABLE, type RecoveryAction, type RecoveryCategory } from "@/lib/integration-recovery";
import { noticeReason } from "@/lib/integration-notice";

export interface RecoveryItem {
  jobId: string;
  leadId: string | null;
  leadName: string | null;
  advisorName: string | null;
  status: string;
  attempts: number;
  errorKind: string | null;
  errorCode: string | null;
  reason: string;
  lastAttemptAt: string | null;
  createdAt: string;
  category: RecoveryCategory;
  action: RecoveryAction;
}

/**
 * Reporte en seco de los avisos MANYCHAT_FLOW abiertos (no confirmados ni
 * descartados), clasificados. No modifica nada ni llama a ManyChat.
 */
export async function buildManyChatRecoveryReport(companyId: string): Promise<{ items: RecoveryItem[]; counts: Record<RecoveryCategory, number> }> {
  const jobs = await prisma.integrationJob.findMany({
    where: { companyId, type: "MANYCHAT_FLOW", status: { in: ["PENDING", "RETRYING", "FAILED", "UNCERTAIN"] } },
    orderBy: { createdAt: "asc" },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          assignedAdvisorId: true,
          assignedAdvisor: { select: { name: true, manyChatSubscriberId: true } },
          assignments: { orderBy: { assignedAt: "desc" }, take: 1, select: { advisorId: true, manyChatNotified: true } },
          integrationJobs: { where: { type: "MANYCHAT_FLOW", status: "SUCCESS" }, select: { createdAt: true } },
        },
      },
    },
  });

  const counts = { ASSIGNED_NOTICE_PENDING: 0, UNASSIGNED: 0, PERMANENT_FAILURE: 0, UNCERTAIN: 0, RECOVERED_STALE_NOTICE: 0, SUPERSEDED: 0 } as Record<RecoveryCategory, number>;
  const items = jobs.map((job): RecoveryItem => {
    const lead = job.lead;
    const latest = lead?.assignments[0];
    const noticeConfirmed =
      Boolean(latest && latest.advisorId === lead?.assignedAdvisorId && latest.manyChatNotified) ||
      Boolean(lead?.integrationJobs.some((other) => other.createdAt > job.createdAt));
    const subscriberId = (job.payload as { subscriberId?: unknown }).subscriberId;
    const { category, action } = categorizeRecovery(
      { status: job.status, subscriberId: typeof subscriberId === "string" ? subscriberId : null },
      {
        exists: Boolean(lead),
        assignedAdvisorId: lead?.assignedAdvisorId ?? null,
        assignedAdvisorSubscriberId: lead?.assignedAdvisor?.manyChatSubscriberId ?? null,
        noticeConfirmed,
      }
    );
    counts[category] += 1;
    return {
      jobId: job.id,
      leadId: job.leadId,
      leadName: lead?.name ?? null,
      advisorName: lead?.assignedAdvisor?.name ?? null,
      status: job.status,
      attempts: job.attempts,
      errorKind: job.errorKind,
      errorCode: job.errorCode,
      reason: noticeReason(job),
      lastAttemptAt: job.lastAttemptAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      category,
      action,
    };
  });
  return { items, counts };
}

export interface RecoveryExecution {
  requeued: string[];
  closed: string[];
  rejected: { jobId: string; reason: string }[];
}

/**
 * Ejecuta SOLO los trabajos indicados, tras recalcular su categoría:
 * - requeue: FAILED/UNCERTAIN → PENDING una sola vez (el cron hace el envío;
 *   si vuelve a fallar queda FAILED sin otra ronda automática).
 * - close: avisos ya confirmados o de un asesor anterior → CANCELLED.
 * Nunca toca el lead, la asignación ni EasyBroker.
 */
export async function executeManyChatRecovery(
  companyId: string,
  request: { requeue?: string[]; close?: string[] },
  actor: string
): Promise<RecoveryExecution> {
  const { items } = await buildManyChatRecoveryReport(companyId);
  const byId = new Map(items.map((item) => [item.jobId, item]));
  const result: RecoveryExecution = { requeued: [], closed: [], rejected: [] };

  for (const jobId of new Set(request.requeue ?? [])) {
    const item = byId.get(jobId);
    if (!item || !REQUEUEABLE.has(item.category)) {
      result.rejected.push({ jobId, reason: item ? `Categoría ${item.category}: no se reenvía.` : "No es un aviso abierto de esta empresa." });
      continue;
    }
    if (await requeueJob(jobId)) {
      result.requeued.push(jobId);
      await logAuditEvent({ companyId, leadId: item.leadId ?? undefined, eventType: "LEAD_RETRY_REQUESTED", status: "ok", message: `Recuperación manual del aviso al asesor solicitada por ${actor}.`, metadata: { jobId } });
    } else {
      result.rejected.push({ jobId, reason: "El trabajo cambió de estado; vuelve a generar el reporte." });
    }
  }

  for (const jobId of new Set(request.close ?? [])) {
    const item = byId.get(jobId);
    if (!item || !CLOSABLE.has(item.category)) {
      result.rejected.push({ jobId, reason: item ? `Categoría ${item.category}: no se cierra.` : "No es un aviso abierto de esta empresa." });
      continue;
    }
    const reason = item.category === "SUPERSEDED" ? "Cerrado manualmente: el lead tiene otro asesor." : "Cerrado manualmente: el aviso ya estaba confirmado.";
    await markJobCancelled(jobId, reason);
    result.closed.push(jobId);
    await logAuditEvent({ companyId, leadId: item.leadId ?? undefined, eventType: "INTEGRATION_JOB_RETRIED", status: "skipped", message: `${reason} (${actor})`, metadata: { jobId } });
  }

  return result;
}
