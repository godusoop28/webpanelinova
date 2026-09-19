import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidDateRangeError, previousDateRange, resolveDateRange } from "@/lib/reporting/date-range";

// Mexico City has been fixed at UTC-6 since the 2022 national DST repeal
// (see lib/timezone.ts), so every expected instant below is simply the
// Mexico-City wall-clock time plus 6 hours. Fixture "now": Sat 2026-09-19
// 09:30 America/Mexico_City == 2026-09-19T15:30:00.000Z.
const NOW_UTC = "2026-09-19T15:30:00.000Z";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_UTC));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveDateRange — today", () => {
  it("spans 00:00:00.000 to 23:59:59.999 Mexico City for the current day", () => {
    const range = resolveDateRange("today");
    expect(range.startDate.toISOString()).toBe("2026-09-19T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-20T05:59:59.999Z");
  });

  it("does not leak into the previous UTC calendar day", () => {
    // A naive UTC-based "today" would start at 2026-09-19T00:00:00Z, six
    // hours before the real Mexico City midnight — this asserts it doesn't.
    const range = resolveDateRange("today");
    expect(range.startDate.getTime()).toBeGreaterThan(new Date("2026-09-19T00:00:00.000Z").getTime());
  });
});

describe("resolveDateRange — this_week / last_week", () => {
  it("this_week starts Monday 00:00 Mexico City and runs through now", () => {
    const range = resolveDateRange("this_week");
    expect(range.startDate.toISOString()).toBe("2026-09-14T06:00:00.000Z"); // Monday
    expect(range.endDate.toISOString()).toBe(NOW_UTC);
  });

  it("last_week is the full prior Monday-Sunday", () => {
    const range = resolveDateRange("last_week");
    expect(range.startDate.toISOString()).toBe("2026-09-07T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-14T05:59:59.999Z");
  });

  it("this_week and last_week never overlap", () => {
    const thisWeek = resolveDateRange("this_week");
    const lastWeek = resolveDateRange("last_week");
    expect(lastWeek.endDate.getTime()).toBeLessThan(thisWeek.startDate.getTime());
  });
});

describe("resolveDateRange — this_month / last_month", () => {
  it("this_month starts on day 1 00:00 Mexico City and runs through now", () => {
    const range = resolveDateRange("this_month");
    expect(range.startDate.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe(NOW_UTC);
  });

  it("last_month is the full prior calendar month", () => {
    const range = resolveDateRange("last_month");
    expect(range.startDate.toISOString()).toBe("2026-08-01T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-01T05:59:59.999Z");
  });

  it("last_month crosses a year boundary correctly (January -> December)", () => {
    vi.setSystemTime(new Date("2026-01-15T15:00:00.000Z"));
    const range = resolveDateRange("last_month");
    expect(range.startDate.toISOString()).toBe("2025-12-01T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-01-01T05:59:59.999Z");
  });
});

describe("resolveDateRange — custom range", () => {
  it("resolves a valid custom range to full-day boundaries", () => {
    const range = resolveDateRange("custom", { from: "2026-09-01", to: "2026-09-19" });
    expect(range.startDate.toISOString()).toBe("2026-09-01T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-20T05:59:59.999Z");
    expect(range.label).toBe("01/09/2026 — 19/09/2026");
  });

  it("accepts a single-day custom range", () => {
    const range = resolveDateRange("custom", { from: "2026-09-19", to: "2026-09-19" });
    expect(range.startDate.toISOString()).toBe("2026-09-19T06:00:00.000Z");
    expect(range.endDate.toISOString()).toBe("2026-09-20T05:59:59.999Z");
  });

  it("throws InvalidDateRangeError when from > to", () => {
    expect(() => resolveDateRange("custom", { from: "2026-09-20", to: "2026-09-10" })).toThrow(
      InvalidDateRangeError
    );
  });

  it("throws InvalidDateRangeError when from/to are missing", () => {
    expect(() => resolveDateRange("custom")).toThrow(InvalidDateRangeError);
    expect(() => resolveDateRange("custom", { from: "", to: "" })).toThrow(InvalidDateRangeError);
  });

  it("throws InvalidDateRangeError on malformed dates", () => {
    expect(() => resolveDateRange("custom", { from: "09/01/2026", to: "2026-09-19" })).toThrow(
      InvalidDateRangeError
    );
    expect(() => resolveDateRange("custom", { from: "2026-02-31", to: "2026-09-19" })).toThrow(
      InvalidDateRangeError
    );
  });

  it("never crashes, loops, or hangs for a wide multi-month custom range", () => {
    const start = Date.now();
    const range = resolveDateRange("custom", { from: "2026-01-01", to: "2026-09-19" });
    expect(Date.now() - start).toBeLessThan(50);
    expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime());
  });
});

describe("previousDateRange", () => {
  it("mirrors the range immediately before it with the same duration", () => {
    const range = resolveDateRange("custom", { from: "2026-09-10", to: "2026-09-19" });
    const previous = previousDateRange(range);
    const currentLength = range.endDate.getTime() - range.startDate.getTime();
    const previousLength = previous.endDate.getTime() - previous.startDate.getTime();
    expect(previousLength).toBe(currentLength);
    expect(previous.endDate.getTime()).toBe(range.startDate.getTime() - 1);
  });
});
