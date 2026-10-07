import { CheckCircle2, Clock, Download, FileSpreadsheet, Info, TriangleAlert, UserCheck, Users, UsersRound } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { leadFilterOptions, listLeadRows } from "@/lib/services/lead-view.service";
import { getReportData, canonicalRouteToInterestTypes, type CanonicalRoute } from "@/lib/reporting/report-data";
import { ALL_CANONICAL_ROUTES, ROUTE_LABELS, percent } from "@/lib/reporting/report-aggregation";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AdvisorBreakdownTable } from "@/components/reports/advisor-breakdown-table";
import { LeadDetailFilters, ReportFilters } from "@/components/reports/lead-filters";
import { LeadDetailTable } from "@/components/reports/lead-detail-table";
import { ROUTE_ICONS } from "@/components/leads/lead-badges";
import { PageHeader } from "@/components/ui/page-header";
import { Card, SectionHeader } from "@/components/ui/card";
import { StatCard, PercentPill } from "@/components/ui/stat-card";
import { BarList } from "@/components/ui/bar-list";
import { buttonClass } from "@/components/ui/button";
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

const FILTER_KEYS = ["range", "from", "to", "q", "ruta", "asesor", "estado", "origen"] as const;

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
  const route = params.ruta && (ALL_CANONICAL_ROUTES as string[]).includes(params.ruta) ? (params.ruta as CanonicalRoute) : undefined;
  const interestTypes = route ? canonicalRouteToInterestTypes(route) : undefined;

  let loadError: string | null = null;
  let report: Awaited<ReturnType<typeof getReportData>> | null = null;
  let leadsPage: Awaited<ReturnType<typeof listLeadRows>> | null = null;
  let options: Awaited<ReturnType<typeof leadFilterOptions>> = { origins: [], advisors: [] };

  if (range) {
    try {
      const companyId = await getDefaultCompanyId();
      [report, options, leadsPage] = await Promise.all([
        getReportData({
          companyId,
          startDate: range.startDate,
          endDate: range.endDate,
          filters: { interestTypes, origin: params.origen, advisorId: params.asesor },
        }),
        leadFilterOptions(companyId),
        listLeadRows(
          {
            companyId,
            from: range.startDate,
            to: range.endDate,
            search: params.q,
            status: params.estado,
            advisorId: params.asesor,
            interestType: interestTypes,
            origin: params.origen,
          },
          page,
          PAGE_SIZE
        ),
      ]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : "Error desconocido";
    }
  }

  // Exportaciones: mismo periodo y mismos filtros que la pantalla.
  const exportParams = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value) exportParams.set(key, value);
  }
  if (!exportParams.has("range")) exportParams.set("range", preset);

  function pageHref(targetPage: number): string {
    const p = new URLSearchParams(exportParams);
    p.set("page", String(targetPage));
    return `/reportes?${p.toString()}#detalle`;
  }

  const summary = report?.summary;
  const globalFilters = Boolean(route || params.origen || params.asesor);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reportes"
        description={
          <>
            Desempeño de leads y asignaciones.
            {user.role === "CONSULTA" && " Modo de solo lectura."}
          </>
        }
        actions={
          <>
            <DateRangeFilter current={preset} rangeLabel={range?.label} />
            {range && (
              <>
                <a href={`/api/reports/pdf?${exportParams.toString()}`} className={buttonClass("dark")}>
                  <Download className="size-4" aria-hidden />
                  Descargar PDF
                </a>
                <a href={`/api/reports/csv?${exportParams.toString()}`} className={buttonClass("secondary")}>
                  <FileSpreadsheet className="size-4" aria-hidden />
                  Exportar CSV
                </a>
              </>
            )}
          </>
        }
      />

      <Card className="p-4">
        <ReportFilters advisors={options.advisors.map((a) => ({ id: a.id, name: a.active ? a.name : `${a.name} (inactivo)` }))} origins={options.origins} />
        {globalFilters && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-500">
            <Info className="size-3.5" aria-hidden />
            Los indicadores, distribuciones, detalle y exportaciones reflejan estos filtros.
          </p>
        )}
      </Card>

      {rangeError ? (
        <ErrorState title="Rango de fechas inválido" description={rangeError} />
      ) : loadError ? (
        <ErrorState title="No se pudieron cargar los reportes" description={loadError} />
      ) : report && summary && leadsPage ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total de leads" value={summary.total} icon={Users} hint={`${summary.uniquePeople} persona(s) única(s) por teléfono`} />
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
              label="Leads pendientes"
              value={summary.pendingLeads}
              icon={Clock}
              tone="warning"
              hint={
                <span className="flex items-center gap-1.5">
                  <PercentPill value={percent(summary.pendingLeads, summary.total)} tone="warning" /> sin completar
                </span>
              }
            />
            <StatCard
              label="Con error de integración"
              value={summary.integrationErrors}
              icon={TriangleAlert}
              tone="danger"
              hint={
                <span className="flex items-center gap-1.5">
                  <PercentPill value={percent(summary.integrationErrors, summary.total)} tone="danger" /> del total
                </span>
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {ALL_CANONICAL_ROUTES.filter((r) => r !== "OTHER" || summary.byRoute.OTHER > 0).map((r) => (
              <StatCard key={r} size="sm" label={ROUTE_LABELS[r]} value={summary.byRoute[r]} icon={ROUTE_ICONS[r]} />
            ))}
            <StatCard size="sm" label="Asesores con leads" value={summary.advisorsWithLeads} icon={UsersRound} tone="neutral" />
            <StatCard size="sm" label="Personas únicas" value={summary.uniquePeople} icon={UserCheck} tone="neutral" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <SectionHeader title="Distribución por ruta" description="Leads del periodo y porcentaje sobre el total." />
              <div className="px-5 pb-3">
                <BarList rows={report.byRoute.map((r) => ({ key: r.route, label: r.label, count: r.count, percent: r.percent, icon: ROUTE_ICONS[r.route] }))} />
              </div>
            </Card>
            <Card>
              <SectionHeader title="Distribución por origen" description="Origen registrado en cada lead." />
              <div className="px-5 pb-3">
                <BarList rows={report.byOrigin.map((r) => ({ key: r.origin, label: r.origin, count: r.count, percent: r.percent }))} />
              </div>
            </Card>
          </div>

          <Card id="asesores" className="scroll-mt-6 overflow-hidden">
            <SectionHeader icon={UsersRound} title="Distribución por asesor" description="Leads únicos por asesor y eventos de asignación del periodo." />
            <AdvisorBreakdownTable rows={report.byAdvisor} />
          </Card>

          <Card id="detalle" className="scroll-mt-6 overflow-hidden">
            <SectionHeader title="Detalle de leads del periodo" description={`${leadsPage.total} lead(s) con los filtros aplicados.`} />
            <div className="px-5 pb-4">
              <LeadDetailFilters />
            </div>
            <LeadDetailTable
              leads={leadsPage.leads}
              page={leadsPage.page}
              totalPages={Math.max(1, Math.ceil(leadsPage.total / leadsPage.limit))}
              total={leadsPage.total}
              pageSize={PAGE_SIZE}
              pageHref={pageHref}
              filtered={Boolean(params.q || params.estado || globalFilters)}
            />
          </Card>

          <p className="flex items-start gap-1.5 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Periodo: {range?.label}. &quot;Asignado&quot; significa que el lead tiene asesor; no equivale a una venta. Los eventos de asignación pueden incluir
            reasignaciones.
          </p>
        </>
      ) : null}
    </div>
  );
}
