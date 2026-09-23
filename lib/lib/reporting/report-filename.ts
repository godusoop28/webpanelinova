import { mexicoCityDateKey } from "@/lib/timezone";

/** Pure so it's unit-testable without touching the DB or a request — e.g. "inova-reporte-2026-09-01-a-2026-09-19.pdf". */
export function buildReportFilename(
  range: { startDate: Date; endDate: Date },
  extension: "pdf" | "csv"
): string {
  const from = mexicoCityDateKey(range.startDate);
  const to = mexicoCityDateKey(range.endDate);
  return `inova-reporte-${from}-a-${to}.${extension}`;
}
