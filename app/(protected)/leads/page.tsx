import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronRight, Clock, MessageCircle, Users } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { leadFilterOptions, leadStatusCounts, listLeadRows, propertyTitles } from "@/lib/services/lead-view.service";
import { LEAD_STATUS_LABELS, PENDING_STATUS_FILTER, PENDING_STATUS_FILTER_LABEL } from "@/lib/lead-status";
import { toCanonicalRoute, ROUTE_LABELS, type RawInterestType } from "@/lib/reporting/report-aggregation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar } from "@/components/ui/avatar";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { TableSearch, UrlSelect } from "@/components/table-search";
import { AssignmentBadge, EasyBrokerBadge, LeadStatusBadge, NoticeBadge } from "@/components/leads/lead-badges";
import { IntegrationNoticeDetails } from "@/components/leads/integration-notice";

const PAGE_SIZE = 25;

function formatDate(value: string): { date: string; time: string } {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value || "—", time: "" };
  const opts = { timeZone: "America/Mexico_City" } as const;
  return {
    date: date.toLocaleDateString("es-MX", { ...opts, day: "2-digit", month: "2-digit", year: "numeric" }),
    time: date.toLocaleTimeString("es-MX", { ...opts, hour: "2-digit", minute: "2-digit" }),
  };
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; origen?: string; asesor?: string }>;
}) {
  await requireSection("leads");
  const { q, page: pageParam, status, origen, asesor } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  let leads: Awaited<ReturnType<typeof listLeadRows>>["leads"] = [];
  let total = 0;
  let counts: Awaited<ReturnType<typeof leadStatusCounts>> | null = null;
  let options: Awaited<ReturnType<typeof leadFilterOptions>> = { origins: [], advisors: [] };
  let titles = new Map<string, string>();
  let loadError: string | null = null;
  try {
    const companyId = await getDefaultCompanyId();
    const [result, countsResult, optionsResult] = await Promise.all([
      listLeadRows({ companyId, search: q, status, origin: origen, advisorId: asesor }, page, PAGE_SIZE),
      leadStatusCounts(companyId),
      leadFilterOptions(companyId),
    ]);
    leads = result.leads;
    total = result.total;
    counts = countsResult;
    options = optionsResult;
    titles = await propertyTitles(companyId, leads.map((lead) => lead.propiedadId));
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = Object.fromEntries(Object.entries({ q, status, origen, asesor }).filter(([, v]) => Boolean(v))) as Record<string, string>;
  const hasFilters = Object.keys(baseParams).length > 0;
  const statusHref = (value?: string) => `/leads${value ? `?status=${value}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Leads" description="Solicitudes recibidas, su asignación y su sincronización con EasyBroker." />

      {counts && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard size="sm" label="Todos" value={counts.total} icon={Users} tone="neutral" href={statusHref()} />
          <StatCard
            size="sm"
            label="Pendientes"
            value={counts.pending}
            icon={Clock}
            tone="warning"
            highlight={status === PENDING_STATUS_FILTER}
            href={statusHref(PENDING_STATUS_FILTER)}
          />
          <StatCard size="sm" label="Con asesor asignado" value={counts.assigned} icon={CheckCircle2} tone="success" />
          <StatCard size="sm" label="Con error" value={counts.failed} icon={AlertCircle} tone="danger" highlight={status === "FAILED"} href={statusHref("FAILED")} />
        </div>
      )}

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] lg:items-end">
        <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
          <span className="block text-xs font-medium text-ink-600">Buscar</span>
          <TableSearch placeholder="Nombre o teléfono…" className="sm:max-w-none" />
        </div>
        <UrlSelect
          param="status"
          label="Estado"
          allLabel="Todos los estados"
          options={[{ value: PENDING_STATUS_FILTER, label: PENDING_STATUS_FILTER_LABEL }, ...Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <UrlSelect param="origen" label="Origen" allLabel="Todos los orígenes" options={options.origins.map((origin) => ({ value: origin, label: origin }))} />
        <UrlSelect
          param="asesor"
          label="Asesor"
          allLabel="Todos los asesores"
          options={options.advisors.map((advisor) => ({ value: advisor.id, label: advisor.active ? advisor.name : `${advisor.name} (inactivo)` }))}
        />
      </Card>

      <Card className="overflow-hidden">
        {loadError ? (
          <div className="p-5">
            <ErrorState title="No se pudieron cargar los leads" description={loadError} />
          </div>
        ) : leads.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={hasFilters ? "Sin resultados" : "Aún no hay leads registrados"}
              description={hasFilters ? "Ningún lead coincide con la búsqueda o los filtros." : undefined}
              action={
                hasFilters ? (
                  <Link href="/leads" className="mt-1 text-xs font-medium text-accent-700 hover:underline">
                    Quitar filtros
                  </Link>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <div className="md:overflow-x-auto">
              <table className="responsive-table data-table w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Interés</th>
                    <th className="px-4 py-3">Origen</th>
                    <th className="px-4 py-3">Propiedad</th>
                    <th className="px-4 py-3">Asesor</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Asignación</th>
                    <th className="px-4 py-3">EasyBroker</th>
                    <th className="px-4 py-3">Aviso</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {leads.map((lead) => {
                    const when = formatDate(lead.fechaHora);
                    const title = lead.propiedadId ? titles.get(lead.propiedadId) : undefined;
                    return (
                      <tr key={lead.id} className="align-top transition-colors duration-150 hover:bg-surface-muted">
                        <td data-label="Cliente" className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar name={lead.nombre || "?"} className="hidden size-9 text-xs md:flex" />
                            <div className="min-w-0">
                              <Link href={`/leads/${lead.id}`} className="font-medium text-ink-900 hover:text-accent-700 hover:underline">
                                {lead.nombre || "Sin nombre"}
                              </Link>
                              <p className="whitespace-nowrap text-xs text-ink-500">{lead.telefono || "—"}</p>
                              {lead.aviso && <IntegrationNoticeDetails notice={lead.aviso} className="mt-0.5" compact />}
                              {lead.error && (
                                <p className="mt-0.5 max-w-56 truncate text-[11px] text-rose-700" title={lead.error}>
                                  {lead.error}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td data-label="Fecha" className="whitespace-nowrap px-4 py-3 text-ink-700">
                          {when.date}
                          <span className="block text-xs text-ink-500">{when.time}</span>
                        </td>
                        <td data-label="Interés" className="px-4 py-3 text-ink-700">
                          {ROUTE_LABELS[toCanonicalRoute(lead.interestType as RawInterestType)]}
                          {lead.ruta && lead.ruta !== ROUTE_LABELS[toCanonicalRoute(lead.interestType as RawInterestType)] && (
                            <span className="block text-xs text-ink-500">{lead.ruta}</span>
                          )}
                        </td>
                        <td data-label="Origen" className="px-4 py-3 text-ink-700">
                          {lead.origen || <span className="text-ink-400">Sin especificar</span>}
                        </td>
                        <td data-label="Propiedad" className="px-4 py-3">
                          {lead.propiedadId ? (
                            <>
                              <Link href={`/propiedades/${lead.propiedadId}`} className="whitespace-nowrap font-medium text-ink-900 hover:text-accent-700 hover:underline">
                                {lead.propiedadId}
                              </Link>
                              <span className="block max-w-48 text-xs text-ink-500">{title ?? "Sin datos en el índice"}</span>
                            </>
                          ) : lead.datoEnviado ? (
                            <span className="block max-w-48 break-words text-xs text-ink-600" title={lead.datoEnviado}>
                              {lead.datoEnviado}
                            </span>
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td data-label="Asesor" className="px-4 py-3 text-ink-700">
                          {lead.asesorAsignado ? (
                            <>
                              {lead.asesorAsignado}
                              {lead.metodoAsignacion && <span className="block text-xs text-ink-500">{lead.metodoAsignacion}</span>}
                            </>
                          ) : (
                            <span className="text-ink-400">Sin asignar</span>
                          )}
                        </td>
                        <td data-label="Estado" className="px-4 py-3">
                          <LeadStatusBadge label={lead.estado} />
                        </td>
                        <td data-label="Asignación" className="px-4 py-3">
                          <AssignmentBadge status={lead.assignmentStatus} />
                        </td>
                        <td data-label="EasyBroker" className="px-4 py-3">
                          <EasyBrokerBadge confirmed={lead.easyBrokerConfirmado} hasAssignment={lead.tieneAsignacion} />
                        </td>
                        <td data-label="Aviso al asesor" className="px-4 py-3">
                          <NoticeBadge notified={lead.manyChatNotificado} hasAssignment={lead.tieneAsignacion} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 md:justify-end">
                            {lead.linkWhatsappCliente && (
                              <a
                                href={lead.linkWhatsappCliente}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex size-9 items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                                aria-label={`Abrir WhatsApp con ${lead.nombre}`}
                                title="Abrir WhatsApp"
                              >
                                <MessageCircle className="size-4" aria-hidden />
                              </a>
                            )}
                            <Link
                              href={`/leads/${lead.id}`}
                              className="inline-flex size-9 items-center justify-center rounded-lg text-ink-500 hover:bg-ink-100 hover:text-ink-900"
                              aria-label={`Ver detalle de ${lead.nombre}`}
                              title="Ver detalle y acciones"
                            >
                              <ChevronRight className="size-4" aria-hidden />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              noun="leads"
              href={(target) => `/leads?${new URLSearchParams({ ...baseParams, page: String(target) }).toString()}`}
            />
          </>
        )}
      </Card>
    </div>
  );
}
