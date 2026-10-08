import "server-only";
import type { IntegrationJob, IntegrationJobStatus, IntegrationJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function createIntegrationJob(data: {
  companyId: string;
  leadId?: string;
  type: IntegrationJobType;
  payload: Prisma.InputJsonValue;
  nextRetryAt?: Date;
  /** Para registrar un primer intento ya fallido (p. ej. el aviso síncrono) con su clasificación real. */
  status?: IntegrationJobStatus;
  attempts?: number;
  lastError?: string;
  errorKind?: string;
  errorCode?: string;
  lastAttemptAt?: Date;
}): Promise<IntegrationJob> {
  return prisma.integrationJob.create({
    data: {
      companyId: data.companyId,
      leadId: data.leadId,
      type: data.type,
      payload: data.payload,
      nextRetryAt: data.nextRetryAt ?? new Date(),
      status: data.status,
      attempts: data.attempts,
      lastError: data.lastError?.slice(0, 2000),
      errorKind: data.errorKind,
      errorCode: data.errorCode,
      lastAttemptAt: data.lastAttemptAt,
    },
  });
}

export function findDueJobs(now: Date, limit = 20): Promise<IntegrationJob[]> {
  return prisma.integrationJob.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] }, nextRetryAt: { lte: now } },
    orderBy: { nextRetryAt: "asc" },
    take: limit,
  });
}

/**
 * Leases a due job to this cron run by pushing its nextRetryAt forward, but
 * only if nobody else touched it since findDueJobs read it. Two overlapping
 * runs (a slow one + the next tick, or a manual trigger) would otherwise
 * both execute it and e.g. notify the advisor twice. A job already in a
 * final state (SUCCESS/FAILED/UNCERTAIN/CANCELLED) never matches.
 */
export async function claimJob(job: IntegrationJob, leaseUntil: Date): Promise<boolean> {
  const { count } = await prisma.integrationJob.updateMany({
    where: { id: job.id, status: job.status, attempts: job.attempts, nextRetryAt: job.nextRetryAt },
    data: { nextRetryAt: leaseUntil, lastAttemptAt: new Date() },
  });
  return count === 1;
}

export function markJobSucceeded(id: string, attempts: number): Promise<IntegrationJob> {
  const now = new Date();
  return prisma.integrationJob.update({ where: { id }, data: { status: "SUCCESS", attempts, resolvedAt: now, lastAttemptAt: now } });
}

/** Ya no aplica: se descarta sin ejecutar. */
export function markJobCancelled(id: string, reason: string): Promise<IntegrationJob> {
  return prisma.integrationJob.update({
    where: { id },
    data: { status: "CANCELLED", resolvedAt: new Date(), errorKind: "SUPERSEDED", errorCode: null, lastError: reason.slice(0, 2000) },
  });
}

export function markJobFailed(
  id: string,
  outcome: {
    attempts: number;
    status: Extract<IntegrationJobStatus, "RETRYING" | "FAILED" | "UNCERTAIN">;
    lastError: string;
    errorKind?: string | null;
    errorCode?: string | null;
    nextRetryAt?: Date | null;
  }
): Promise<IntegrationJob> {
  return prisma.integrationJob.update({
    where: { id },
    data: {
      attempts: outcome.attempts,
      lastError: outcome.lastError.slice(0, 2000),
      status: outcome.status,
      errorKind: outcome.errorKind ?? null,
      errorCode: outcome.errorCode ?? null,
      nextRetryAt: outcome.nextRetryAt ?? undefined,
    },
  });
}

/**
 * Recuperación manual y selectiva: solo un trabajo FAILED/UNCERTAIN vuelve
 * a la cola, una vez. Conserva `attempts`, así que si vuelve a fallar queda
 * FAILED sin otra ronda automática de reintentos.
 */
export async function requeueJob(id: string, now: Date = new Date()): Promise<boolean> {
  const { count } = await prisma.integrationJob.updateMany({
    where: { id, status: { in: ["FAILED", "UNCERTAIN"] } },
    data: { status: "PENDING", nextRetryAt: now },
  });
  return count === 1;
}
