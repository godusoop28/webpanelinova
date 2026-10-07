import Link from "next/link";
import { BarChart3, Building2, CalendarCheck, ChevronRight, FileSpreadsheet, House, Info, Users } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigurePropertyReports } from "@/lib/permissions";
import { mexicoCityDateKey, formatMexicoCityDateTime } from "@/lib/timezone";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { formatDayKeyNumeric, NOT_IDENTIFIED } from "@/lib/reporting/property-report";
import { dataSinceKey, listPropertyReport, type PropertyReportRow } from "@/lib/services/property-report.service";
import { DateRangeFilter } from "@/components/date-range-filter";
import { TableSearch } from "@/components/table-search";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/state";

interface SearchParams {
  range?: string;
  from?: string;
  to?: string;
  q?: string;
}

/** Procedencias conocidas: lo que dijo el cliente y el portal del enlace que pegó. "No identificado" se muestra como tal, no como cero. */
function SourceChips({ row }: { row: PropertyReportRow }) {
  if (row.periodLeads === 0) return <span className="text-ink-400" title="Sin leads en el periodo">—</span>;
  const declared = row.declared.filter((s) => s.label !== NOT_IDENTIFIED);
  const portals = row.linkPortals.filter((s) => s.label !== NOT_IDENTIFIED);
  if (declared.length === 0 && portals.length === 0) return <Badge tone="neutral">{NOT_IDENTIFIED}</Badge>;
  return (
    <div className="flex max-w-60 flex-wrap gap-1">
      {declared.map((s) => (
        <Badge key={`d-${s.label}`} tone="info" title="Dicho por el cliente">
          {s.label} · {s.contacts}
        </Badge>
      ))}
      {portals.map((s) => (
        <Badge key={`p-${s.label}`} tone="gold" title="Portal del enlace que pegó el cliente">
          Enlace {s.label} · {s.contacts}
        </Badge>
      ))}
    </div>
  );
}

function propertyDetails(row: PropertyReportRow): string | null {
  const parts = [
    row.propertyType,
    row.bedrooms != null ? `${row.bedrooms} recámara${row.bedrooms === 1 ? "" : "s"}` : null,
    row.location,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireSection("propiedades");
  const params = await searchParams;
  const { preset, custom } = presetFromSearchParams({ ...params, range: params.range ?? "this_week" });

  let range: ReturnType<typeof resolveDateRange> | null = null;
  let error: string | null = null;
  let rows: PropertyReportRow[] = [];
  let since: string | null = null;
  try {
    range = resolveDateRange(preset, custom);
    const companyId = await getDefaultCompanyId();
    [rows, since] = await Promise.all([
      listPropertyReport({ companyId, startKey: mexicoCityDateKey(range.startDate), endKey: mexicoCityDateKey(range.endDate), search: params.q }),
      dataSinceKey(companyId),
    ]);
  } catch (e) {
    error = e instanceof InvalidDateRangeError ? e.message : e instanceof Error ? e.message : "Error desconocido";
  }

  const exportParams = new URLSearchParams();
  exportParams.set("range", preset);
  if (custom) {
    exportParams.set("from", custom.from);
    exportParams.set("to", custom.to);
  }
  if (params.q) exportParams.set("q", params.q);
  const detailQuery = exportParams.toString();
  const totalLeads = rows.reduce((sum, row) => sum + row.periodLeads, 0);
  const withInterest = rows.filter((row) => row.periodLeads > 0).length;
  const totalEvents = rows.reduce((sum, row) => sum + row.periodEvents, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Propiedades"
        description={
          <>
            Interés y actividad por inmueble.
            {user.role === "CONSULTA" && " Modo de solo lectura."}
          </>
        }
        actions={<DateRangeFilter current={preset} rangeLabel={range?.label} />}
      />

      {error ? (
        <ErrorState title="No se pudo cargar el reporte" description={error} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Propiedades con interés" value={withInterest} icon={House} hint="Con al menos un lead en el periodo" />
            <StatCard label="Suma de leads por propiedad" value={totalLeads} icon={Users} hint="Una persona cuenta en cada propiedad que consultó" />
            <StatCard
              label="Actividades"
              value={totalEvents}
              icon={CalendarCheck}
              tone="neutral"
              hint={totalEvents === 0 ? "Sin actividades registradas en el periodo" : "Registradas en el periodo"}
            />
          </div>

          <div className="space-y-1 text-xs text-ink-600">
            <p>
              <span className="font-semibold text-ink-800">Periodo: {range?.label}</span> · {rows.length} propiedad(es) con consultas · {totalLeads} lead(s) únicos por
              propiedad en el periodo.
            </p>
            {since && (
              <p className="text-ink-500">
                Datos disponibles desde el <span className="font-medium text-ink-700">{formatDayKeyNumeric(since)}</span> (leads de propiedad/campaña y, desde el
                28/09/2026, conversaciones del asistente); no es el histórico completo de la empresa.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TableSearch placeholder="Código o nombre de propiedad…" className="sm:max-w-md" />
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <a href={`/api/reports/properties/csv?${exportParams.toString()}`} className={buttonClass("secondary")}>
                <FileSpreadsheet className="size-4" aria-hidden />
                Exportar CSV
              </a>
              {canConfigurePropertyReports(user.role) && (
                <Link href="/propiedades/configuracion" className={buttonClass("secondary")}>
                  <BarChart3 className="size-4" aria-hidden />
                  Reporte de los viernes
                </Link>
              )}
            </div>
          </div>

          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title={params.q ? "Sin resultados" : "Sin consultas por propiedad en este periodo"}
                  description={params.q ? "Ninguna propiedad con consultas coincide con la búsqueda." : "Prueba con un periodo más amplio."}
                />
              </div>
            ) : (
              <div className="md:overflow-x-auto">
                <table className="responsive-table data-table w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th className="px-5 py-3">Propiedad</th>
                      <th className="px-4 py-3 text-right">Leads del periodo</th>
                      <th className="px-4 py-3 text-right">Acumulado</th>
                      <th className="px-4 py-3 text-right">Consultas / mensajes</th>
                      <th className="px-4 py-3">Procedencia conocida</th>
                      <th className="px-4 py-3 text-right">Actividades</th>
                      <th className="px-4 py-3">Actualizado</th>
                      <th className="px-4 py-3">
                        <span className="sr-only">Abrir</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100 tabular-nums">
                    {rows.map((row) => {
                      const details = propertyDetails(row);
                      return (
                        <tr key={row.publicId} className="transition-colors duration-150 hover:bg-surface-muted">
                          <td data-label="Propiedad" className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {/* El índice no guarda fotografías: marcador discreto en lugar de imágenes inventadas. */}
                              <div className="hidden size-12 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-400 md:flex" aria-hidden>
                                <Building2 className="size-5" />
                              </div>
                              <div className="min-w-0">
                                <Link
                                  href={`/propiedades/${row.publicId}?${detailQuery}`}
                                  className="font-medium text-ink-900 hover:text-accent-700 hover:underline"
                                >
                                  {row.title ?? <span className="italic text-ink-500">Sin datos en el índice</span>}
                                </Link>
                                {details && <p className="max-w-80 truncate text-xs text-ink-500">{details}</p>}
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-semibold text-ink-700">{row.publicId}</span>
                                  {row.published === false && <Badge tone="gold">No publicada</Badge>}
                                  {row.published === null && <Badge tone="neutral">Fuera del índice</Badge>}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td data-label="Leads del periodo" className="px-4 py-3 text-lg font-semibold text-ink-950 md:text-right">
                            {row.periodLeads}
                          </td>
                          <td data-label="Acumulado" className="px-4 py-3 text-ink-700 md:text-right">
                            {row.cumulativeLeads}
                          </td>
                          <td data-label="Consultas / mensajes" className="px-4 py-3 text-ink-700 md:text-right">
                            {row.periodInquiries} / {row.periodMessages}
                          </td>
                          <td data-label="Procedencia" className="px-4 py-3">
                            <SourceChips row={row} />
                          </td>
                          <td data-label="Actividades" className="px-4 py-3 text-ink-700 md:text-right">
                            {row.periodEvents}
                          </td>
                          <td data-label="Actualizado" className="whitespace-nowrap px-4 py-3 text-xs text-ink-500">
                            {row.lastActivityAt ? formatMexicoCityDateTime(row.lastActivityAt) : "—"}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              href={`/propiedades/${row.publicId}?${detailQuery}`}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                              aria-label={`Ver detalle, actividades y destinatarios de ${row.publicId}`}
                            >
                              <ChevronRight className="size-4" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="flex items-start gap-1.5 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              Lead único = persona distinta por propiedad y periodo (varios mensajes cuentan una vez; quien pregunta por dos propiedades cuenta en ambas, por eso la
              suma no son personas únicas globales). Acumulado = personas distintas hasta el fin del periodo. &quot;No identificado&quot; = hubo leads pero no se
              conoce su procedencia; &quot;—&quot; = sin leads en el periodo. El canal es WhatsApp; el portal de un enlace pegado no prueba de dónde llegó el
              cliente. Se excluyen pruebas y simulaciones.
            </span>
          </p>
        </>
      )}
    </div>
  );
}
