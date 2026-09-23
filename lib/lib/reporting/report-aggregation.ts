/**
 * Pure, DB-agnostic core of report aggregation (mirrors the
 * lib/assignment-engine.ts / lib/services/assignment.service.ts split): no
 * "server-only", no Prisma import — takes the plain rows Postgres's
 * groupBy() would return and reduces them in memory. This is what makes
 * route/advisor/origin aggregation unit-testable without a database.
 * lib/reporting/report-data.ts is the thin server-only wrapper that runs
 * the real groupBy queries and calls into this.
 */

export const CANONICAL_ROUTES = ["PROPERTY", "EXPLORE", "CAMPAIGN", "TIMEOUT"] as const;
export type CanonicalRoute = (typeof CANONICAL_ROUTES)[number] | "OTHER";
export const ALL_CANONICAL_ROUTES: CanonicalRoute[] = [...CANONICAL_ROUTES, "OTHER"];

export const ROUTE_LABELS: Record<CanonicalRoute, string> = {
  PROPERTY: "Propiedad",
  EXPLORE: "Explorar",
  CAMPAIGN: "Campaña",
  TIMEOUT: "Sin respuesta",
  OTHER: "Otro",
};

export type RawInterestType = "PROPERTY" | "EXPLORE" | "CAMPAIGN" | "TIMEOUT" | "NO_RESPONSE" | "OTHER";
export type RawAssignmentMethod = "DIRECT_PROPERTY_ADVISOR" | "WEIGHTED_ROTATION" | "CAMPAIGN_DIRECT" | "MANUAL" | "FALLBACK";

const DIRECT_METHODS: RawAssignmentMethod[] = ["DIRECT_PROPERTY_ADVISOR", "CAMPAIGN_DIRECT"];
const TERMINAL_STATUSES = ["COMPLETED", "FAILED"];

/** NO_RESPONSE is a reserved enum value the assignment pipeline never writes (see lib/interest-classification.ts) — folded into TIMEOUT ("Sin respuesta") if it ever appears, rather than silently dropped from totals. */
export function toCanonicalRoute(interestType: RawInterestType): CanonicalRoute {
  if (interestType === "NO_RESPONSE") return "TIMEOUT";
  if (interestType === "OTHER") return "OTHER";
  return interestType;
}

/** Inverse of toCanonicalRoute, for filtering by the UI's canonical route (a Lead.interestType `in` filter). */
export function canonicalRouteToInterestTypes(route: CanonicalRoute): RawInterestType[] {
  if (route === "TIMEOUT") return ["TIMEOUT", "NO_RESPONSE"];
  return [route];
}

export function emptyRouteCounts(): Record<CanonicalRoute, number> {
  return { PROPERTY: 0, EXPLORE: 0, CAMPAIGN: 0, TIMEOUT: 0, OTHER: 0 };
}

export function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export interface RouteBreakdownRow {
  route: CanonicalRoute;
  label: string;
  count: number;
  percent: number;
}

export interface OriginBreakdownRow {
  origin: string;
  count: number;
  percent: number;
}

export interface StatusBreakdownRow {
  status: string;
  label: string;
  count: number;
  percent: number;
}

export interface AdvisorBreakdownRow {
  advisorId: string | null;
  advisorName: string;
  total: number;
  percent: number;
  byRoute: Record<CanonicalRoute, number>;
  /** Assignment *events* in the period (WEIGHTED_ROTATION/FALLBACK), not leads — can exceed `total` if a lead was reassigned more than once. */
  automatic: number;
  exclusive: number;
  manual: number;
}

export interface ReportSummary {
  total: number;
  uniquePeople: number;
  byRoute: Record<CanonicalRoute, number>;
  advisorsWithLeads: number;
  pendingLeads: number;
  integrationErrors: number;
  assignedLeads: number;
}

export interface AggregatedReportData {
  summary: ReportSummary;
  byRoute: RouteBreakdownRow[];
  byOrigin: OriginBreakdownRow[];
  byAdvisor: AdvisorBreakdownRow[];
  byStatus: StatusBreakdownRow[];
}

export interface RawGroupInputs {
  total: number;
  routeGroups: { interestType: RawInterestType; count: number }[];
  originGroups: { origin: string | null; count: number }[];
  statusGroups: { status: string; count: number }[];
  advisorRouteGroups: { assignedAdvisorId: string | null; interestType: RawInterestType; count: number }[];
  advisorNames: { id: string; name: string }[];
  methodGroups: { advisorId: string; method: RawAssignmentMethod; count: number }[];
  uniquePhoneCount: number;
  statusLabel: (status: string) => string;
}

export function aggregateReportData(input: RawGroupInputs): AggregatedReportData {
  const { total } = input;

  // --- byRoute -------------------------------------------------------
  const routeCounts = emptyRouteCounts();
  for (const group of input.routeGroups) {
    routeCounts[toCanonicalRoute(group.interestType)] += group.count;
  }
  const byRoute: RouteBreakdownRow[] = ALL_CANONICAL_ROUTES.filter((route) => routeCounts[route] > 0).map(
    (route) => ({
      route,
      label: ROUTE_LABELS[route],
      count: routeCounts[route],
      percent: percent(routeCounts[route], total),
    })
  );

  // --- byOrigin --------------------------------------------------------
  // Merge by resolved label: distinct raw groups (e.g. NULL and "  ") can
  // both resolve to "Sin especificar" and must collapse into one row.
  const originCounts = new Map<string, number>();
  for (const group of input.originGroups) {
    const label = group.origin?.trim() || "Sin especificar";
    originCounts.set(label, (originCounts.get(label) ?? 0) + group.count);
  }
  const byOrigin: OriginBreakdownRow[] = Array.from(originCounts.entries())
    .map(([origin, count]) => ({ origin, count, percent: percent(count, total) }))
    .sort((a, b) => b.count - a.count);

  // --- byStatus --------------------------------------------------------
  const byStatus: StatusBreakdownRow[] = input.statusGroups
    .map((group) => ({
      status: group.status,
      label: input.statusLabel(group.status),
      count: group.count,
      percent: percent(group.count, total),
    }))
    .sort((a, b) => b.count - a.count);
  const pendingLeads = input.statusGroups
    .filter((g) => !TERMINAL_STATUSES.includes(g.status))
    .reduce((sum, g) => sum + g.count, 0);
  const integrationErrors = input.statusGroups.find((g) => g.status === "FAILED")?.count ?? 0;

  // --- byAdvisor ---------------------------------------------------------
  const advisorNameById = new Map(input.advisorNames.map((a) => [a.id, a.name]));
  const advisorRows = new Map<string, AdvisorBreakdownRow>();
  let assignedLeads = 0;
  for (const group of input.advisorRouteGroups) {
    const advisorId = group.assignedAdvisorId;
    const key = advisorId ?? "__unassigned__";
    if (!advisorRows.has(key)) {
      advisorRows.set(key, {
        advisorId,
        advisorName: advisorId ? (advisorNameById.get(advisorId) ?? "Asesor eliminado") : "Sin asignar",
        total: 0,
        percent: 0,
        byRoute: emptyRouteCounts(),
        automatic: 0,
        exclusive: 0,
        manual: 0,
      });
    }
    const row = advisorRows.get(key)!;
    row.byRoute[toCanonicalRoute(group.interestType)] += group.count;
    row.total += group.count;
    if (advisorId) assignedLeads += group.count;
  }
  for (const group of input.methodGroups) {
    const row = advisorRows.get(group.advisorId);
    if (!row) continue;
    if (DIRECT_METHODS.includes(group.method)) row.exclusive += group.count;
    else if (group.method === "MANUAL") row.manual += group.count;
    else row.automatic += group.count; // WEIGHTED_ROTATION, FALLBACK
  }
  const byAdvisor = Array.from(advisorRows.values())
    .map((row) => ({ ...row, percent: percent(row.total, total) }))
    .sort((a, b) => b.total - a.total);
  const advisorsWithLeads = byAdvisor.filter((row) => row.advisorId !== null).length;

  const summary: ReportSummary = {
    total,
    uniquePeople: input.uniquePhoneCount,
    byRoute: routeCounts,
    advisorsWithLeads,
    pendingLeads,
    integrationErrors,
    assignedLeads,
  };

  return { summary, byRoute, byOrigin, byAdvisor, byStatus };
}
