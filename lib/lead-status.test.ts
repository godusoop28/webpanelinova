import { describe, it, expect } from "vitest";
import { leadStatusLabel, LEAD_STATUS_LABELS } from "@/lib/lead-status";

describe("leadStatusLabel", () => {
  it("translates every known status to Spanish", () => {
    for (const [status, label] of Object.entries(LEAD_STATUS_LABELS)) {
      expect(leadStatusLabel(status)).toBe(label);
    }
  });

  it("falls back to the raw value for an unknown status instead of throwing", () => {
    expect(leadStatusLabel("SOME_FUTURE_STATUS")).toBe("SOME_FUTURE_STATUS");
  });
});
