import "server-only";
import { getAdvisorRowsFresh, getLeadRowsFresh, type AdvisorRow } from "@/lib/google-sheets";
import {
  buildTodayLeadCounts,
  canReceiveRoute,
  hasReachedDailyLimit,
  isEligibleForRotation,
  isPaused,
} from "@/lib/advisors";

/**
 * The weighted rotation engine used by POST /select-advisor and by the
 * "probar distribución" panel. Exclusive-assignment advisors never reach
 * this file's filters (isEligibleForRotation excludes them) — EasyBroker
 * keeps deciding those leads on its own; this module never touches that
 * logic. Deliberately kept free of React/UI concerns per AGENTS.md.
 */

export type AdvisorSelectionResult =
  | { ok: true; advisor: AdvisorRow }
  | { ok: false; error: "NO_ADVISORS_AVAILABLE" };

/**
 * Candidates currently eligible to be picked for `route`. A single fetch of
 * advisors + today's leads, reused by both a live selection and by running
 * many in-memory simulations without hitting Sheets per iteration.
 */
export async function getRotationCandidates(route: string, now: Date = new Date()): Promise<AdvisorRow[]> {
  const [advisors, leads] = await Promise.all([getAdvisorRowsFresh(), getLeadRowsFresh()]);
  const todayCounts = buildTodayLeadCounts(leads, now);

  return advisors
    .filter(isEligibleForRotation)
    .filter((advisor) => !isPaused(advisor, now))
    .filter((advisor) => canReceiveRoute(advisor, route))
    .filter((advisor) => !hasReachedDailyLimit(advisor, todayCounts));
}

/**
 * Picks exactly one advisor from `candidates`, with probability
 * proportional to `peso`. Pure and deterministic given a `random` source,
 * so it's straightforward to unit test. Never falls back to an arbitrary
 * pick when the list is empty — that's the caller's job to handle.
 */
export function selectWeightedAdvisor(
  candidates: AdvisorRow[],
  random: () => number = Math.random
): AdvisorRow | null {
  if (candidates.length === 0) return null;

  const totalWeight = candidates.reduce((sum, advisor) => sum + advisor.peso, 0);
  if (totalWeight <= 0) return null;

  let cursor = random() * totalWeight;
  for (const advisor of candidates) {
    cursor -= advisor.peso;
    if (cursor <= 0) return advisor;
  }
  // Floating-point rounding safety net: fall back to the last candidate.
  return candidates[candidates.length - 1];
}

export async function selectAdvisorForLead(route: string, now: Date = new Date()): Promise<AdvisorSelectionResult> {
  const candidates = await getRotationCandidates(route, now);
  const advisor = selectWeightedAdvisor(candidates);
  if (!advisor) return { ok: false, error: "NO_ADVISORS_AVAILABLE" };
  return { ok: true, advisor };
}
