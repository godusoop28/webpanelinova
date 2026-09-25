import "server-only";
import type { IntegrationJob, IntegrationJobType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function createIntegrationJob(data: {
  companyId: string;
  leadId?: string;
  type: IntegrationJobType;
  payload: Prisma.InputJsonValue;
  nextRetryAt?: Date;
}): Promise<IntegrationJob> {
  return prisma.integrationJob.create({
    data: {
      companyId: data.companyId,
      leadId: data.leadId,
      type: data.type,
      payload: data.payload,
      nextRetryAt: data.nextRetryAt ?? new Date(),
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
 * both execute it and e.g. notify the advisor twice.
 */
export async function claimJob(job: IntegrationJob, leaseUntil: Date): Promise<boolean> {
  const { count } = await prisma.integrationJob.updateMany({
    where: { id: job.id, status: job.status, attempts: job.attempts, nextRetryAt: job.nextRetryAt },
    data: { nextRetryAt: leaseUntil },
  });
  return count === 1;
}

export function markJobSucceeded(id: string): Promise<IntegrationJob> {
  return prisma.integrationJob.update({ where: { id }, data: { status: "SUCCESS" } });
}

export function markJobFailed(
  id: string,
  attempts: number,
  lastError: string,
  nextRetryAt: Date | null
): Promise<IntegrationJob> {
  return prisma.integrationJob.update({
    where: { id },
    data: {
      attempts,
      lastError: lastError.slice(0, 2000),
      status: nextRetryAt ? "RETRYING" : "FAILED",
      nextRetryAt: nextRetryAt ?? undefined,
    },
  });
}
