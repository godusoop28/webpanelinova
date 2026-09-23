/**
 * Pure, DB-agnostic core of the weighted assignment engine (Fase 9). No
 * "server-only", no Prisma import — this is what makes it unit-testable
 * without a database. lib/services/assignment.service.ts is the thin
 * server-only wrapper that fetches real Advisor rows and calls into this.
 */

export type AssignmentRoute = "PROPERTY" | "EXPLORE" | "CAMPAIGN" | "TIMEOUT";

export interface AdvisorForAssignment {
  id: string;
  name: string;
  active: boolean;
  weight: number;
  pausedUntil: Date | null;
  dailyLimit: number | null;
  allowedProperty: boolean;
  allowedExplore: boolean;
  allowedCampaign: boolean;
  allowedTimeout: boolean;
}

const ROUTE_FIELD: Record<AssignmentRoute, keyof AdvisorForAssignment> = {
  PROPERTY: "allowedProperty",
  EXPLORE: "allowedExplore",
  CAMPAIGN: "allowedCampaign",
  TIMEOUT: "allowedTimeout",
};

/**
 * Mirrors the WHERE clause in
 * lib/repositories/assignment.repository.ts#lockEligibleAdvisorsForUpdate —
 * kept here too so the exact same rule is unit-testable without Postgres.
 * Never selects: inactive, weight<=0, route not allowed, or currently paused.
 */
export function isAdvisorEligibleForRoute(advisor: AdvisorForAssignment, route: AssignmentRoute, now: Date): boolean {
  if (!advisor.active) return false;
  if (advisor.weight <= 0) return false;
  if (!advisor[ROUTE_FIELD[route]]) return false;
  if (advisor.pausedUntil && advisor.pausedUntil > now) return false;
  return true;
}

const RATIO_EPSILON = 1e-9;

/**
 * Weighted least-assigned: picks the eligible advisor with the lowest
 * (leads today / weight) ratio — an advisor with weight 100 keeps
 * receiving leads proportionally more often than one with weight 25,
 * without ever being purely random (Fase 9). Ties (usually "nobody has a
 * lead yet today") break by higher weight, then by `random` only as a last
 * resort — kept injectable so this stays pure and deterministic in tests.
 */
export function pickWeightedLeastAssigned<T extends AdvisorForAssignment>(
  candidates: T[],
  todayCounts: Map<string, number>,
  random: () => number = Math.random
): T | null {
  const eligible = candidates.filter((advisor) => {
    const count = todayCounts.get(advisor.id) ?? 0;
    return advisor.dailyLimit === null || count < advisor.dailyLimit;
  });
  if (eligible.length === 0) return null;

  let bestRatio = Infinity;
  let bestGroup: T[] = [];
  for (const advisor of eligible) {
    const count = todayCounts.get(advisor.id) ?? 0;
    const ratio = count / advisor.weight;
    if (ratio < bestRatio - RATIO_EPSILON) {
      bestRatio = ratio;
      bestGroup = [advisor];
    } else if (Math.abs(ratio - bestRatio) <= RATIO_EPSILON) {
      bestGroup.push(advisor);
    }
  }
  if (bestGroup.length === 1) return bestGroup[0];

  const maxWeight = Math.max(...bestGroup.map((advisor) => advisor.weight));
  const topWeightGroup = bestGroup.filter((advisor) => advisor.weight === maxWeight);
  if (topWeightGroup.length === 1) return topWeightGroup[0];

  return topWeightGroup[Math.floor(random() * topWeightGroup.length)];
}
