import "server-only";
import { prisma } from "@/lib/db";
import { leadStatusLabel } from "@/lib/lead-status";
import { aggregateReportData, type AggregatedReportData } from "@/lib/reporting/report-aggregation";

export {
  CANONICAL_ROUTES,
  ALL_CANONICAL_ROUTES,
  ROUTE_LABELS,
  canonicalRouteToInterestTypes,
  type CanonicalRoute,
  type RouteBreakdownRow,
  type OriginBreakdownRow,
  type StatusBreakdownRow,
  type AdvisorBreakdownRow,
  type ReportSummary,
} from "@/lib/reporting/report-aggregation";

export interface ReportDataParams {
  companyId: string;
  startDate: Date;
  endDate: Date;
}

export interface ReportData extends AggregatedReportData {
  companyId: string;
  startDate: Date;
  endDate: Date;
}

/**
 * The one place that counts leads for a period. Dashboard, /reportes, and
 * the PDF/CSV exports all call this instead of computing their own totals,
 * so they can never disagree (AGENTS.md task: "Dashboard y Reportes deben
 * coincidir"). Every number comes from Postgres GROUP BY/aggregate queries
 * scoped by companyId + createdAt (see the (companyId, createdAt) index
 * added in the accompanying migration) — never a full row fetch, and never
 * an LLM. Runs a fixed number of queries regardless of how many leads fall
 * in the period, so a multi-month range is not meaningfully slower than
 * "today". The reduction itself lives in report-aggregation.ts, pure and
 * unit-tested without a database.
 */
export async function getReportData({ companyId, startDate, endDate }: ReportDataParams): Promise<ReportData> {
  const where = { companyId, createdAt: { gte: startDate, lte: endDate } };

  const [
    total,
    routeGroups,
    originGroups,
    statusGroups,
    advisorRouteGroups,
    advisorNames,
    methodGroups,
    uniquePhoneRows,
  ] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["interestType"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["origin"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["assignedAdvisorId", "interestType"], where, _count: { _all: true } }),
    prisma.advisor.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.leadAssignment.groupBy({
      by: ["advisorId", "method"],
      where: { lead: { companyId, createdAt: { gte: startDate, lte: endDate } } },
      _count: { _all: true },
    }),
    prisma.lead.findMany({ where, distinct: ["phone"], select: { phone: true } }),
  ]);

  const aggregated = aggregateReportData({
    total,
    routeGroups: routeGroups.map((g) => ({ interestType: g.interestType, count: g._count._all })),
    originGroups: originGroups.map((g) => ({ origin: g.origin, count: g._count._all })),
    statusGroups: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    advisorRouteGroups: advisorRouteGroups.map((g) => ({
      assignedAdvisorId: g.assignedAdvisorId,
      interestType: g.interestType,
      count: g._count._all,
    })),
    advisorNames,
    methodGroups: methodGroups.map((g) => ({ advisorId: g.advisorId, method: g.method, count: g._count._all })),
    uniquePhoneCount: uniquePhoneRows.filter((r) => r.phone).length,
    statusLabel: leadStatusLabel,
  });

  return { companyId, startDate, endDate, ...aggregated };
}
