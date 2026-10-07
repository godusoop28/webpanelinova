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
import { ALL_CANONICAL_ROUTES, ROUTE_LABELS, canonicalRouteToInterestTypes, type CanonicalRoute } from "@/lib/reporting/report-aggregation";
import type { ReportFilters } from "@/lib/reporting/report-data";
import { leadStatusLabel, PENDING_STATUS_FILTER, PENDING_STATUS_FILTER_LABEL } from "@/lib/lead-status";

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

export interface ExportFilters {
  /** Afectan indicadores y detalle (igual que la barra de filtros de /reportes). */
  report: ReportFilters;
  /** Solo afectan la lista de leads (búsqueda y estado del detalle). */
  status?: string;
  search?: string;
  route?: CanonicalRoute;
}

/** Lee ruta/origen/asesor/estado/búsqueda con los mismos nombres de parámetro que /reportes. */
export function resolveExportFilters(request: NextRequest): ExportFilters {
  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.get(key)?.trim() || undefined;
  const ruta = get("ruta");
  const route = ruta && (ALL_CANONICAL_ROUTES as string[]).includes(ruta) ? (ruta as CanonicalRoute) : undefined;
  return {
    report: {
      interestTypes: route ? canonicalRouteToInterestTypes(route) : undefined,
      origin: get("origen"),
      advisorId: get("asesor"),
    },
    status: get("estado"),
    search: get("q"),
    route,
  };
}

/** Descripción legible de los filtros activos, para el PDF y el nombre del periodo. */
export function describeExportFilters(filters: ExportFilters, advisorName?: string | null): string[] {
  const parts: string[] = [];
  if (filters.route) parts.push(`Ruta: ${ROUTE_LABELS[filters.route]}`);
  if (filters.report.origin) parts.push(`Origen: ${filters.report.origin}`);
  if (filters.report.advisorId) parts.push(`Asesor: ${advisorName ?? "seleccionado"}`);
  if (filters.status) parts.push(`Estado: ${filters.status === PENDING_STATUS_FILTER ? PENDING_STATUS_FILTER_LABEL : leadStatusLabel(filters.status)}`);
  if (filters.search) parts.push(`Búsqueda: "${filters.search}"`);
  return parts;
}
