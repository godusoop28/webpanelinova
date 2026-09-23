import { describe, expect, it } from "vitest";
import { buildReportFilename } from "@/lib/reporting/report-filename";

describe("buildReportFilename", () => {
  it("formats the period using Mexico City calendar dates", () => {
    const name = buildReportFilename(
      { startDate: new Date("2026-09-01T06:00:00.000Z"), endDate: new Date("2026-09-20T05:59:59.999Z") },
      "pdf"
    );
    expect(name).toBe("inova-reporte-2026-09-01-a-2026-09-19.pdf");
  });

  it("supports the csv extension", () => {
    const name = buildReportFilename(
      { startDate: new Date("2026-09-01T06:00:00.000Z"), endDate: new Date("2026-09-20T05:59:59.999Z") },
      "csv"
    );
    expect(name).toBe("inova-reporte-2026-09-01-a-2026-09-19.csv");
  });

  it("never crosses a UTC day boundary incorrectly for a single-day range", () => {
    // Mexico City midnight on 2026-09-19 is 2026-09-19T06:00:00Z, not the UTC calendar day.
    const name = buildReportFilename(
      { startDate: new Date("2026-09-19T06:00:00.000Z"), endDate: new Date("2026-09-20T05:59:59.999Z") },
      "pdf"
    );
    expect(name).toBe("inova-reporte-2026-09-19-a-2026-09-19.pdf");
  });
});
