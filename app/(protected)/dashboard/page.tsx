import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, TriangleAlert, Users } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { getReportData } from "@/lib/reporting/report-data";
import { ALL_CANONICAL_ROUTES, ROUTE_LABELS, percent } from "@/lib/reporting/report-aggregation";
import { PENDING_STATUS_FILTER } from "@/lib/lead-status";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { RecentLeadsTable } from "@/components/reports/recent-leads-table";
import { ROUTE_ICONS } from "@/components/leads/lead-badges";
import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatCard, PercentPill } from "@/components/ui/stat-card";
import { BarList } from "@/components/ui/bar-list";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state";

const RECENT_LEADS_LIMIT = 8;
const TOP_ADVISORS_LIMIT = 5;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  await requireSection("dashboard");
  const params = await searchParams;
  const { preset, custom } = presetFromSearchParams(params);

  let range: ReturnType<typeof resolveDateRange> | null = null;
  let rangeError: string | null = null;
  try {
    range = resolveDateRange(preset, custom);
  } catch (error) {
    rangeError = error instanceof InvalidDateRangeError ? error.message : "Rango de fechas inválido.";
  }

  let loadError: string | null = null;
  let report: Awaited<ReturnType<typeof getReportData>> | null = null;
  let recentLeads: Awaited<ReturnType<typeof listLeadRows>>["leads"] = [];

  if (range) {
    try {
      const companyId = await getDefaultCompanyId();
      const [reportResult, leadsResult] = await Promise.all([
        getReportData({ companyId, startDate: range.startDate, endDate: range.endDate }),
        listLeadRows({ companyId, from: range.startDate, to: range.endDate }, 1, RECENT_LEADS_LIMIT),
      ]);
      report = reportResult;
      recentLeads = leadsResult.leads;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Error desconocido";
    }
  }

  const rangeQuery = new URLSearchParams(
    preset === "custom" && custom ? { range: preset, from: custom.from, to: custom.to } : { range: preset }
  );
  const reportHref = (extra: Record<string, string> = {}, hash = "") => {
    const query = new URLSearchParams(rangeQuery);
    for (const [key, value] of Object.entries(extra)) query.set(key, value);
    return `/reportes?${query.toString()}${hash}`;
  };

  const summary = report?.summary;
  const topAdvisors = report?.byAdvisor.filter((row) => row.advisorId !== null).slice(0, TOP_ADVISORS_LIMIT) ?? [];
  const routeCards = summary ? ALL_CANONICAL_ROUTES.filter((route) => route !== "OTHER" || summary.byRoute.OTHER > 0) : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Resumen ejecutivo"
        description="Indicadores consolidados del periodo seleccionado."
        actions={<DateRangeFilter current={preset} rangeLabel={range?.label} />}
      />

      {rangeError ? (
        <ErrorState title="Rango de fechas inválido" description={rangeError} />
      ) : loadError ? (
        <ErrorState title="No se pudieron cargar los indicadores" description={loadError} />
      ) : report && summary ? (
        <>
          {summary.pendingLeads > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    {summary.pendingLeads} lead{summary.pendingLeads === 1 ? "" : "s"} sin completar el proceso de asignación
                  </p>
                  <p className="text-xs text-ink-600">Leads del periodo que todavía no están completados ni marcados con error.</p>
                </div>
              </div>
              <Link href={reportHref({ estado: PENDING_STATUS_FILTER }, "#detalle")} className={buttonClass("primary", "sm", "self-start sm:self-auto")}>
                Ver pendientes
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total de leads"
              value={summary.total}
              icon={Users}
              hint={`${summary.uniquePeople} persona${summary.uniquePeople === 1 ? "" : "s"} única${summary.uniquePeople === 1 ? "" : "s"} por teléfono`}
            />
            <StatCard
              label="Asignados a un asesor"
              value={summary.assignedLeads}
              icon={CheckCircle2}
              tone="success"
              hint={
                <span className="flex items-center gap-1.5">
                  <PercentPill value={percent(summary.assignedLeads, summary.total)} tone="success" /> del total
                </span>
              }
            />
            <StatCard
              label="Pendientes"
              value={summary.pendingLeads}
              icon={Clock}
              tone="warning"
              href={summary.pendingLeads > 0 ? reportHref({ estado: PENDING_STATUS_FILTER }, "#detalle") : undefined}
              hint={
                <span className="flex items-center gap-1.5">
                  <PercentPill value={percent(summary.pendingLeads, summary.total)} tone="warning" /> del total
                </span>
              }
            />
            <StatCard
              label="Errores de integración"
              value={summary.integrationErrors}
              icon={TriangleAlert}
              tone="danger"
              href={summary.integrationErrors > 0 ? reportHref({ estado: "FAILED" }, "#detalle") : undefined}
              hint={
                <span className="flex items-center gap-1.5">
                  <PercentPill value={percent(summary.integrationErrors, summary.total)} tone="danger" /> del total
                </span>
              }
            />
          </div>

          <div className={routeCards.length > 4 ? "grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5" : "grid grid-cols-2 gap-4 xl:grid-cols-4"}>
            {routeCards.map((route) => (
              <StatCard
                key={route}
                size="sm"
                label={ROUTE_LABELS[route]}
                value={summary.byRoute[route]}
                icon={ROUTE_ICONS[route]}
                href={reportHref({ ruta: route })}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <SectionHeader title="Distribución por ruta" description="Porcentaje sobre el total de leads del periodo." />
              <div className="px-5 pb-3">
                <BarList
                  rows={report.byRoute.map((row) => ({ key: row.route, label: row.label, count: row.count, percent: row.percent, icon: ROUTE_ICONS[row.route] }))}
                />
              </div>
            </Card>
            <Card>
              <SectionHeader
                title="Asesores con más asignaciones"
                description={`${summary.advisorsWithLeads} asesor${summary.advisorsWithLeads === 1 ? "" : "es"} con leads asignados en el periodo.`}
                action={
                  <Link href={reportHref({}, "#asesores")} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
                    Ver todos <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <div className="px-5 pb-3">
                <BarList
                  emptyLabel="Sin asignaciones en el periodo"
                  rows={topAdvisors.map((row) => ({
                    key: row.advisorId ?? "none",
                    label: row.advisorName,
                    count: row.total,
                    percent: row.percent,
                    leading: <Avatar name={row.advisorName} className="size-8 text-xs" />,
                  }))}
                />
              </div>
            </Card>
          </div>

          <Card>
            <SectionHeader
              title="Últimos leads"
              action={
                <Link href={reportHref({}, "#detalle")} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
                  Ver reporte completo <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              }
            />
            <RecentLeadsTable leads={recentLeads} />
          </Card>
        </>
      ) : null}
    </div>
  );
}
