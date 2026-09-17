import { describe, it, expect } from "vitest";
import { nextBackoffRetryAt } from "@/lib/retry";

describe("nextBackoffRetryAt — Fase 20 schedule (1min, 5min, 15min, 1h)", () => {
  const schedule = [1, 5, 15, 60];
  const now = new Date("2026-01-01T00:00:00Z");

  it("schedules the first retry 1 minute out after the 1st failure", () => {
    const result = nextBackoffRetryAt(1, schedule, now);
    expect(result?.getTime()).toBe(now.getTime() + 1 * 60 * 1000);
  });

  it("schedules progressively longer delays for later attempts", () => {
    expect(nextBackoffRetryAt(2, schedule, now)?.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
    expect(nextBackoffRetryAt(3, schedule, now)?.getTime()).toBe(now.getTime() + 15 * 60 * 1000);
    expect(nextBackoffRetryAt(4, schedule, now)?.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it("gives up (returns null) once attempts exceed the schedule length", () => {
    expect(nextBackoffRetryAt(5, schedule, now)).toBeNull();
    expect(nextBackoffRetryAt(99, schedule, now)).toBeNull();
  });
});
