import "server-only";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireRoleApi, unauthorizedResponse } from "@/lib/api-auth";
import {
  resolveDateRange,
  presetFromSearchParams,
  InvalidDateRangeError,
  type ResolvedDateRange,
} from "@/lib/reporting/date-range";

/**
 * Same 3 roles /reportes itself is visible to (lib/permissions.ts's
 * SECTION_ACCESS.reportes) — downloading a report is read access, so it
 * follows the same gate as viewing it, CONSULTA included.
 */
const REPORT_EXPORT_ROLES = ["ADMIN", "DIRECCION", "CONSULTA"] as const;

/** Safety cap on rows rendered into an export — keeps a multi-month PDF/CSV from ballooning serverless memory/time. Screen pagination has no such cap. */
export const EXPORT_LEAD_CAP = 2000;

export async function requireReportExportAccess(): Promise<NextResponse | null> {
  const authResult = await requireRoleApi(...REPORT_EXPORT_ROLES);
  if (!authResult.ok) return unauthorizedResponse(authResult);
  return null;
}

export function resolveExportDateRange(request: NextRequest): { range: ResolvedDateRange } | { error: NextResponse } {
  const url = new URL(request.url);
  const { preset, custom } = presetFromSearchParams({
    range: url.searchParams.get("range") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  try {
    return { range: resolveDateRange(preset, custom) };
  } catch (error) {
    const message = error instanceof InvalidDateRangeError ? error.message : "Rango de fechas inválido.";
    return {
      error: NextResponse.json({ ok: false, error: { code: "INVALID_DATE_RANGE", message } }, { status: 400 }),
    };
  }
}
