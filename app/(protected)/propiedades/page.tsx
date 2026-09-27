import Link from "next/link";
import { FileSpreadsheet, Settings } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigurePropertyReports } from "@/lib/permissions";
import { mexicoCityDateKey, formatMexicoCityDateTime } from "@/lib/timezone";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import { formatDayKeyNumeric, NOT_IDENTIFIED } from "@/lib/reporting/property-report";
import { dataSinceKey, listPropertyReport } from "@/lib/services/property-report.service";
import { DateRangeFilter } from "@/components/date-range-filter";
import { TableSearch } from "@/components/table-search";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state";

interface SearchParams {
  range?: string;
  from?: string;
  to?: string;
  q?: string;
}

function knownSources(row: { linkPortals: { label: string; contacts: number }[]; declared: { label: string; contacts: number }[] }): string {
  const parts = [
    ...row.declared.filter((s) => s.label !== NOT_IDENTIFIED).map((s) => `${s.label} (dicho) ${s.contacts}`),
    ...row.linkPortals.filter((s) => s.label !== NOT_IDENTIFIED).map((s) => `enlace ${s.label} ${s.contacts}`),
  ];
  return parts.length ? parts.join(" · ") : NOT_IDENTIFIED;
}

export default async function PropiedadesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireSection("propiedades");
  const params = await searchParams;
  const { preset, custom } = presetFromSearchParams({ ...params, range: params.range ?? "this_week" });

  let range: ReturnType<typeof resolveDateRange> | null = null;
  let error: string | null = null;
  let rows: Awaited<ReturnType<typeof listPropertyReport>> = [];
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
  const totalLeads = rows.reduce((sum, row) => sum + row.periodLeads, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Propiedades</h1>
          <p className="text-sm text-ink-500">
            Personas distintas que preguntaron por cada inmueble, procedencia conocida y actividad registrada.
            {user.role === "CONSULTA" && " Modo de solo lectura."}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <DateRangeFilter current={preset} />
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/reports/properties/csv?${exportParams.toString()}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
            >
              <FileSpreadsheet className="size-3.5" aria-hidden />
              Exportar CSV
            </a>
            {canConfigurePropertyReports(user.role) && (
              <Link
                href="/propiedades/configuracion"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-muted"
              >
                <Settings className="size-3.5" aria-hidden />
                Reporte de los viernes
              </Link>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState title="No se pudo cargar el reporte" description={error} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Periodo: <span className="font-medium text-ink-700">{range?.label}</span> · {rows.length} propiedad(es) con consultas · {totalLeads} lead(s) únicos por
              propiedad en el periodo.
              {since && (
                <>
                  {" "}
                  Datos disponibles desde el <span className="font-medium text-ink-700">{formatDayKeyNumeric(since)}</span> (leads de propiedad/campaña y, desde el
                  28/09/2026, conversaciones del asistente); no es el histórico completo de la empresa.
                </>
              )}
            </p>
            <TableSearch placeholder="Código o nombre de propiedad…" />
          </div>

          <Card>
            {rows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Sin consultas por propiedad en este periodo" description={params.q ? "Ajusta tu búsqueda." : undefined} />
              </div>
            ) : (
              <div className="md:overflow-x-auto">
                <table className="responsive-table w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <th className="px-5 py-3 font-medium">Propiedad</th>
                      <th className="px-5 py-3 font-medium">Leads del periodo</th>
                      <th className="px-5 py-3 font-medium">Acumulado</th>
                      <th className="px-5 py-3 font-medium">Consultas / mensajes</th>
                      <th className="px-5 py-3 font-medium">Procedencia conocida</th>
                      <th className="px-5 py-3 font-medium">Actividades</th>
                      <th className="px-5 py-3 font-medium">Actualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.publicId} className="border-b border-ink-50 last:border-0 hover:bg-surface-muted">
                        <td data-label="Propiedad" className="px-5 py-3">
                          <Link href={`/propiedades/${row.publicId}?${exportParams.toString()}`} className="font-medium text-ink-900 hover:text-gold-700 hover:underline">
                            {row.publicId}
                          </Link>
                          <p className="max-w-xs truncate text-xs text-ink-500">{row.title ?? "Sin datos en el índice"}</p>
                          {row.published === false && <Badge tone="neutral">No publicada</Badge>}
                        </td>
                        <td data-label="Leads del periodo" className="px-5 py-3 text-lg font-semibold text-ink-900">
                          {row.periodLeads}
                        </td>
                        <td data-label="Acumulado" className="px-5 py-3 text-ink-700">
                          {row.cumulativeLeads}
                        </td>
                        <td data-label="Consultas / mensajes" className="px-5 py-3 text-ink-600">
                          {row.periodInquiries} / {row.periodMessages}
                        </td>
                        <td data-label="Procedencia" className="max-w-xs px-5 py-3 text-xs text-ink-600">
                          {row.periodLeads ? knownSources(row) : "—"}
                        </td>
                        <td data-label="Actividades" className="px-5 py-3 text-ink-600">
                          {row.periodEvents}
                        </td>
                        <td data-label="Actualizado" className="whitespace-nowrap px-5 py-3 text-xs text-ink-500">
                          {row.lastActivityAt ? formatMexicoCityDateTime(row.lastActivityAt) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <p className="text-xs text-ink-400">
            Lead único = persona distinta por propiedad y periodo (varios mensajes cuentan una vez; quien pregunta por dos propiedades cuenta en ambas). Acumulado =
            personas distintas hasta el fin del periodo. El canal es WhatsApp; el portal de un enlace pegado no prueba de dónde llegó el cliente. Se excluyen pruebas y
            simulaciones.
          </p>
        </>
      )}
    </div>
  );
}
