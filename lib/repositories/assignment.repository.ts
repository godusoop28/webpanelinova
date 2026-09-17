import "server-only";
import type { Advisor, LeadAssignment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AssignmentRoute } from "@/lib/assignment-engine";

export type { AssignmentRoute } from "@/lib/assignment-engine";

const ROUTE_COLUMN: Record<AssignmentRoute, string> = {
  PROPERTY: '"allowedProperty"',
  EXPLORE: '"allowedExplore"',
  CAMPAIGN: '"allowedCampaign"',
  TIMEOUT: '"allowedTimeout"',
};

/**
 * Locks every currently-eligible advisor row with SELECT ... FOR UPDATE, so
 * two concurrent leads can't both read "0 leads today" for the same advisor
 * and both pick it (Fase 9's concurrency requirement). Must run inside
 * `prisma.$transaction`. ORDER BY id keeps lock-acquisition order
 * consistent across concurrent calls, which avoids deadlocks.
 *
 * $queryRawUnsafe is used only to select which fixed, whitelisted boolean
 * column to filter on (ROUTE_COLUMN) — every actual value is still
 * parameterized, so this never interpolates caller-controlled data.
 */
export async function lockEligibleAdvisorsForUpdate(
  tx: Prisma.TransactionClient,
  companyId: string,
  route: AssignmentRoute,
  now: Date
): Promise<Advisor[]> {
  const routeColumn = ROUTE_COLUMN[route];
  return tx.$queryRawUnsafe<Advisor[]>(
    `SELECT * FROM "advisors"
     WHERE "companyId" = $1
       AND "active" = true
       AND "weight" > 0
       AND ${routeColumn} = true
       AND ("pausedUntil" IS NULL OR "pausedUntil" <= $2)
     ORDER BY "id"
     FOR UPDATE`,
    companyId,
    now
  );
}

/** Authoritative daily count from LeadAssignment, not the Advisor.leadsToday cache (Fase 10). */
export async function countTodayAssignmentsByAdvisor(
  tx: Prisma.TransactionClient,
  advisorIds: string[],
  dayStart: Date,
  dayEnd: Date
): Promise<Map<string, number>> {
  if (advisorIds.length === 0) return new Map();
  const rows = await tx.leadAssignment.groupBy({
    by: ["advisorId"],
    where: { advisorId: { in: advisorIds }, assignedAt: { gte: dayStart, lte: dayEnd } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.advisorId, row._count._all]));
}

/** Same query, outside a transaction — for display (advisors panel, dashboard), not for picking a candidate. */
export async function getAdvisorDailyAssignmentCount(advisorId: string, dayStart: Date, dayEnd: Date): Promise<number> {
  return prisma.leadAssignment.count({
    where: { advisorId, assignedAt: { gte: dayStart, lte: dayEnd } },
  });
}

export function createAssignmentRecord(
  tx: Prisma.TransactionClient,
  data: Prisma.LeadAssignmentUncheckedCreateInput
): Promise<LeadAssignment> {
  return tx.leadAssignment.create({ data });
}

export function incrementAdvisorLeadsTodayCache(tx: Prisma.TransactionClient, advisorId: string) {
  return tx.advisor.update({ where: { id: advisorId }, data: { leadsToday: { increment: 1 } } });
}

export function updateAssignmentStatus(
  id: string,
  data: Partial<Pick<LeadAssignment, "status" | "easyBrokerConfirmed" | "manyChatNotified">>
): Promise<LeadAssignment> {
  return prisma.leadAssignment.update({ where: { id }, data });
}

export function findAssignmentsByLeadId(leadId: string): Promise<LeadAssignment[]> {
  return prisma.leadAssignment.findMany({ where: { leadId }, orderBy: { assignedAt: "desc" } });
}
