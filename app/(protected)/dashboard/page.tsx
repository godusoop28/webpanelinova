import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { getReportData } from "@/lib/reporting/report-data";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { SummaryCards } from "@/components/reports/summary-cards";
import { BreakdownCard } from "@/components/reports/breakdown-card";
import { RecentLeadsTable } from "@/components/reports/recent-leads-table";
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

  const reportHref = `/reportes?${new URLSearchParams(
    preset === "custom" && custom ? { range: preset, from: custom.from, to: custom.to } : { range: preset }
  ).toString()}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Resumen ejecutivo</h1>
          <p className="text-sm text-ink-500">Indicadores consolidados del periodo seleccionado.</p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      {rangeError ? (
        <ErrorState title="Rango de fechas inválido" description={rangeError} />
      ) : loadError ? (
        <ErrorState title="No se pudieron cargar los indicadores" description={loadError} />
      ) : report ? (
        <>
          <p className="text-xs text-ink-400">
            Periodo: <span className="font-medium text-ink-600">{range!.label}</span>
          </p>

          <SummaryCards summary={report.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="Desglose por ruta"
              columnLabel="Ruta"
              rows={report.byRoute.map((r) => ({ label: r.label, count: r.count, percent: r.percent }))}
            />
            <BreakdownCard
              title="Top asesores"
              columnLabel="Asesor"
              rows={report.byAdvisor
                .slice(0, TOP_ADVISORS_LIMIT)
                .map((a) => ({ label: a.advisorName, count: a.total, percent: a.percent }))}
              emptyLabel="Sin asignaciones en el periodo"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">Últimos leads</h2>
              <Link
                href={reportHref}
                className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-600"
              >
                Ver reporte completo
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <RecentLeadsTable leads={recentLeads} />
          </div>
        </>
      ) : null}
    </div>
  );
}
