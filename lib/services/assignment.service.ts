import "server-only";
import type { Advisor, AssignmentMethod, LeadAssignment } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  countTodayAssignmentsByAdvisor,
  createAssignmentRecord,
  incrementAdvisorLeadsTodayCache,
  lockEligibleAdvisorsForUpdate,
} from "@/lib/repositories/assignment.repository";
import type { AssignmentRoute } from "@/lib/assignment-engine";
import { pickWeightedLeastAssigned } from "@/lib/assignment-engine";
import { mexicoCityDayRange } from "@/lib/timezone";

export type { AssignmentRoute } from "@/lib/assignment-engine";
export { pickWeightedLeastAssigned } from "@/lib/assignment-engine";

export interface CandidateSnapshot {
  id: string;
  name: string;
  weight: number;
  todayCount: number;
  dailyLimit: number | null;
}

export type AssignmentSelectionResult =
  | {
      ok: true;
      assignment: LeadAssignment;
      advisor: Advisor;
      candidatesConsidered: CandidateSnapshot[];
    }
  | { ok: false; error: "NO_ADVISORS_AVAILABLE"; candidatesConsidered: CandidateSnapshot[] };

/**
 * Picks an advisor and records the LeadAssignment atomically. Runs entirely
 * inside one Postgres transaction with the candidate rows locked
 * (lockEligibleAdvisorsForUpdate) so two leads arriving at the same instant
 * can't both read "0 leads today" for the same advisor and double-book them
 * (Fase 9). Deliberately does NOT call EasyBroker/ManyChat here — those are
 * separate HTTP calls the caller makes after this transaction commits
 * (Fase 39: no external calls inside a long DB transaction).
 */
export async function selectAndAssignAdvisor(input: {
  companyId: string;
  leadId: string;
  route: AssignmentRoute;
  method: AssignmentMethod;
  now?: Date;
}): Promise<AssignmentSelectionResult> {
  const now = input.now ?? new Date();
  const { start, end } = mexicoCityDayRange(now);

  return prisma.$transaction(async (tx) => {
    const locked = await lockEligibleAdvisorsForUpdate(tx, input.companyId, input.route, now);
    const todayCounts = await countTodayAssignmentsByAdvisor(
      tx,
      locked.map((advisor) => advisor.id),
      start,
      end
    );
    const picked = pickWeightedLeastAssigned(locked, todayCounts);

    const candidatesConsidered: CandidateSnapshot[] = locked.map((advisor) => ({
      id: advisor.id,
      name: advisor.name,
      weight: advisor.weight,
      todayCount: todayCounts.get(advisor.id) ?? 0,
      dailyLimit: advisor.dailyLimit,
    }));

    if (!picked) {
      return { ok: false, error: "NO_ADVISORS_AVAILABLE", candidatesConsidered };
    }

    const ratio = (todayCounts.get(picked.id) ?? 0) / picked.weight;
    const assignment = await createAssignmentRecord(tx, {
      leadId: input.leadId,
      advisorId: picked.id,
      method: input.method,
      weightAtAssignment: picked.weight,
      status: "ASSIGNED",
      reason: `weighted-least-assigned entre ${locked.length} candidato(s); ratio=${ratio.toFixed(3)}`,
    });
    await incrementAdvisorLeadsTodayCache(tx, picked.id);

    return { ok: true, assignment, advisor: picked, candidatesConsidered };
  });
}

/** Direct assignment (property has its own dedicated advisor) — no rotation, no locking needed. */
export async function assignDirectAdvisor(input: {
  leadId: string;
  advisorId: string;
  advisorWeight: number;
  method: AssignmentMethod;
  reason: string;
}): Promise<LeadAssignment> {
  return prisma.$transaction(async (tx) => {
    const assignment = await createAssignmentRecord(tx, {
      leadId: input.leadId,
      advisorId: input.advisorId,
      method: input.method,
      weightAtAssignment: input.advisorWeight,
      status: "ASSIGNED",
      reason: input.reason,
    });
    await incrementAdvisorLeadsTodayCache(tx, input.advisorId);
    return assignment;
  });
}

/** Fase 10: the authoritative count, for display (advisors panel, dashboard) — not for picking a candidate. */
export async function getAdvisorDailyAssignmentCount(advisorId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = mexicoCityDayRange(now);
  return prisma.leadAssignment.count({ where: { advisorId, assignedAt: { gte: start, lte: end } } });
}

/** Batched version of getAdvisorDailyAssignmentCount, for a whole list (e.g. the /asesores panel) in one query. */
export async function getAdvisorsDailyAssignmentCounts(
  advisorIds: string[],
  now: Date = new Date()
): Promise<Map<string, number>> {
  if (advisorIds.length === 0) return new Map();
  const { start, end } = mexicoCityDayRange(now);
  const rows = await prisma.leadAssignment.groupBy({
    by: ["advisorId"],
    where: { advisorId: { in: advisorIds }, assignedAt: { gte: start, lte: end } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.advisorId, row._count._all]));
}
