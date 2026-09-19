import { Download, FileSpreadsheet } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { listAdvisorViews } from "@/lib/services/advisor.service";
import { getReportData, canonicalRouteToInterestTypes, type CanonicalRoute } from "@/lib/reporting/report-data";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { SummaryCards } from "@/components/reports/summary-cards";
import { BreakdownCard } from "@/components/reports/breakdown-card";
import { AdvisorBreakdownTable } from "@/components/reports/advisor-breakdown-table";
import { LeadFilters } from "@/components/reports/lead-filters";
import { LeadDetailTable } from "@/components/reports/lead-detail-table";
import { ErrorState } from "@/components/ui/state";

const PAGE_SIZE = 50;

interface ReportesSearchParams {
  range?: string;
  from?: string;
  to?: string;
  page?: string;
  q?: string;
  ruta?: string;
  asesor?: string;
  estado?: string;
  origen?: string;
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<ReportesSearchParams>;
}) {
  const user = await requireSection("reportes");
  const params = await searchParams;
  const { preset, custom } = presetFromSearchParams(params);

  let range: ReturnType<typeof resolveDateRange> | null = null;
  let rangeError: string | null = null;
  try {
    range = resolveDateRange(preset, custom);
  } catch (error) {
    rangeError = error instanceof InvalidDateRangeError ? error.message : "Rango de fechas inválido.";
  }

  const page = Math.max(1, Number(params.page) || 1);

  let loadError: string | null = null;
  let report: Awaited<ReturnType<typeof getReportData>> | null = null;
  let leadsPage: Awaited<ReturnType<typeof listLeadRows>> | null = null;
  let advisors: Awaited<ReturnType<typeof listAdvisorViews>> = [];

  if (range) {
    try {
      const companyId = await getDefaultCompanyId();
      const [reportResult, advisorsResult, leadsResult] = await Promise.all([
        getReportData({ companyId, startDate: range.startDate, endDate: range.endDate }),
        listAdvisorViews(companyId),
        listLeadRows(
          {
            companyId,
            from: range.startDate,
            to: range.endDate,
            search: params.q,
            status: params.estado,
            advisorId: params.asesor,
            interestType: params.ruta ? canonicalRouteToInterestTypes(params.ruta as CanonicalRoute) : undefined,
            origin: params.origen,
          },
          page,
          PAGE_SIZE
        ),
      ]);
      report = reportResult;
      advisors = advisorsResult;
      leadsPage = leadsResult;
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Error desconocido";
    }
  }

  const pdfParams = new URLSearchParams();
  if (range) {
    pdfParams.set("range", preset);
    if (preset === "custom" && custom) {
      pdfParams.set("from", custom.from);
      pdfParams.set("to", custom.to);
    }
  }

  function pageHref(targetPage: number): string {
    const p = new URLSearchParams();
    if (params.range) p.set("range", params.range);
    if (params.from) p.set("from", params.from);
    if (params.to) p.set("to", params.to);
    if (params.q) p.set("q", params.q);
    if (params.ruta) p.set("ruta", params.ruta);
    if (params.asesor) p.set("asesor", params.asesor);
    if (params.estado) p.set("estado", params.estado);
    if (params.origen) p.set("origen", params.origen);
    p.set("page", String(targetPage));
    return `/reportes?${p.toString()}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Reportes</h1>
          <p className="text-sm text-ink-500">
            Consulta el desempeño de los leads por periodo, origen, ruta y asesor.
            {user.role === "CONSULTA" && " Modo de solo lectura."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <DateRangeFilter current={preset} />
          {range && (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`/api/reports/pdf?${pdfParams.toString()}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
              >
                <Download className="size-3.5" aria-hidden />
                Descargar PDF
              </a>
              <a
                href={`/api/reports/csv?${pdfParams.toString()}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                <FileSpreadsheet className="size-3.5" aria-hidden />
                Exportar CSV
              </a>
            </div>
          )}
        </div>
      </div>

      {rangeError ? (
        <ErrorState title="Rango de fechas inválido" description={rangeError} />
      ) : loadError ? (
        <ErrorState title="No se pudieron cargar los reportes" description={loadError} />
      ) : report && leadsPage ? (
        <>
          <p className="text-xs text-ink-400">
            Periodo: <span className="font-medium text-ink-600">{range!.label}</span>
          </p>

          <SummaryCards summary={report.summary} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownCard
              title="Distribución por ruta"
              columnLabel="Ruta"
              rows={report.byRoute.map((r) => ({ label: r.label, count: r.count, percent: r.percent }))}
            />
            <BreakdownCard
              title="Distribución por origen"
              columnLabel="Origen"
              rows={report.byOrigin.map((r) => ({ label: r.origin, count: r.count, percent: r.percent }))}
            />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Distribución por asesor</h2>
            <AdvisorBreakdownTable rows={report.byAdvisor} />
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink-900">Detalle de leads del periodo</h2>
            <LeadFilters
              advisors={advisors.filter((a) => a.activo).map((a) => ({ id: a.id, name: a.nombre }))}
              origins={report.byOrigin.map((o) => o.origin).filter((o) => o !== "Sin especificar")}
            />
            <LeadDetailTable
              leads={leadsPage.leads}
              page={leadsPage.page}
              totalPages={Math.max(1, Math.ceil(leadsPage.total / leadsPage.limit))}
              total={leadsPage.total}
              pageHref={pageHref}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
