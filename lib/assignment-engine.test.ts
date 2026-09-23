import { describe, it, expect } from "vitest";
import { isAdvisorEligibleForRoute, pickWeightedLeastAssigned, type AdvisorForAssignment } from "@/lib/assignment-engine";

function makeAdvisor(overrides: Partial<AdvisorForAssignment> = {}): AdvisorForAssignment {
  return {
    id: "advisor-1",
    name: "Asesor de prueba",
    active: true,
    weight: 5,
    pausedUntil: null,
    dailyLimit: null,
    allowedProperty: true,
    allowedExplore: true,
    allowedCampaign: true,
    allowedTimeout: true,
    ...overrides,
  };
}

describe("isAdvisorEligibleForRoute", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("rejects an inactive advisor", () => {
    expect(isAdvisorEligibleForRoute(makeAdvisor({ active: false }), "EXPLORE", now)).toBe(false);
  });

  it("rejects weight <= 0", () => {
    expect(isAdvisorEligibleForRoute(makeAdvisor({ weight: 0 }), "EXPLORE", now)).toBe(false);
  });

  it("rejects a route the advisor doesn't participate in", () => {
    expect(isAdvisorEligibleForRoute(makeAdvisor({ allowedCampaign: false }), "CAMPAIGN", now)).toBe(false);
    expect(isAdvisorEligibleForRoute(makeAdvisor({ allowedCampaign: false }), "EXPLORE", now)).toBe(true);
  });

  it("rejects an advisor paused into the future", () => {
    const paused = makeAdvisor({ pausedUntil: new Date("2026-01-16T00:00:00Z") });
    expect(isAdvisorEligibleForRoute(paused, "EXPLORE", now)).toBe(false);
  });

  it("accepts an advisor whose pause already expired", () => {
    const expired = makeAdvisor({ pausedUntil: new Date("2026-01-14T00:00:00Z") });
    expect(isAdvisorEligibleForRoute(expired, "EXPLORE", now)).toBe(true);
  });

  it("accepts an eligible advisor", () => {
    expect(isAdvisorEligibleForRoute(makeAdvisor(), "PROPERTY", now)).toBe(true);
  });
});

describe("pickWeightedLeastAssigned", () => {
  it("returns null when there are no candidates", () => {
    expect(pickWeightedLeastAssigned([], new Map())).toBeNull();
  });

  it("excludes an advisor who already hit their daily limit", () => {
    const underLimit = makeAdvisor({ id: "a", dailyLimit: 3 });
    const atLimit = makeAdvisor({ id: "b", dailyLimit: 3 });
    const counts = new Map([
      ["a", 1],
      ["b", 3],
    ]);
    const picked = pickWeightedLeastAssigned([underLimit, atLimit], counts);
    expect(picked?.id).toBe("a");
  });

  it("returns null when every candidate is at their daily limit", () => {
    const a = makeAdvisor({ id: "a", dailyLimit: 2 });
    const b = makeAdvisor({ id: "b", dailyLimit: 2 });
    const counts = new Map([
      ["a", 2],
      ["b", 2],
    ]);
    expect(pickWeightedLeastAssigned([a, b], counts)).toBeNull();
  });

  it("picks the advisor with the lowest (today / weight) ratio", () => {
    const a = makeAdvisor({ id: "a", weight: 100 });
    const b = makeAdvisor({ id: "b", weight: 25 });
    // a: 10/100 = 0.10, b: 1/25 = 0.04 -> b should win despite fewer raw leads.
    const counts = new Map([
      ["a", 10],
      ["b", 1],
    ]);
    expect(pickWeightedLeastAssigned([a, b], counts)?.id).toBe("b");
  });

  it("distributes proportionally to weight over many picks (weight 100 vs weight 25 -> ~4:1)", () => {
    const a = makeAdvisor({ id: "a", weight: 100 });
    const b = makeAdvisor({ id: "b", weight: 25 });
    const counts = new Map<string, number>([
      ["a", 0],
      ["b", 0],
    ]);
    for (let i = 0; i < 125; i++) {
      const picked = pickWeightedLeastAssigned([a, b], counts)!;
      counts.set(picked.id, (counts.get(picked.id) ?? 0) + 1);
    }
    expect(counts.get("a")).toBe(100);
    expect(counts.get("b")).toBe(25);
  });

  it("breaks a tie by higher weight before falling back to random", () => {
    const low = makeAdvisor({ id: "low", weight: 1 });
    const high = makeAdvisor({ id: "high", weight: 10 });
    const counts = new Map([
      ["low", 0],
      ["high", 0],
    ]);
    // Both at ratio 0 -> tie -> higher weight wins deterministically, random must not be called.
    const picked = pickWeightedLeastAssigned([low, high], counts, () => {
      throw new Error("random should not be called when weights break the tie");
    });
    expect(picked?.id).toBe("high");
  });

  it("uses the injected random source only among fully-tied candidates", () => {
    const a = makeAdvisor({ id: "a", weight: 5 });
    const b = makeAdvisor({ id: "b", weight: 5 });
    const counts = new Map([
      ["a", 0],
      ["b", 0],
    ]);
    expect(pickWeightedLeastAssigned([a, b], counts, () => 0)?.id).toBe("a");
    expect(pickWeightedLeastAssigned([a, b], counts, () => 0.999)?.id).toBe("b");
  });
});
