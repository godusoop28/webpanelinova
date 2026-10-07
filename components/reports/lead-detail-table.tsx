import Link from "next/link";
import { EmptyState } from "@/components/ui/state";
import { Pagination } from "@/components/ui/pagination";
import { AssignmentBadge, EasyBrokerBadge, LeadStatusBadge, NoticeBadge } from "@/components/leads/lead-badges";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import { toCanonicalRoute, ROUTE_LABELS, type RawInterestType } from "@/lib/reporting/report-aggregation";
import type { LeadView } from "@/lib/types";

export function LeadDetailTable({
  leads,
  page,
  totalPages,
  total,
  pageSize,
  pageHref,
  filtered,
}: {
  leads: LeadView[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  pageHref: (page: number) => string;
  filtered: boolean;
}) {
  if (leads.length === 0) {
    return (
      <div className="px-5 pb-5">
        <EmptyState
          title={filtered ? "Sin resultados" : "No hay leads en este periodo"}
          description={filtered ? "Ningún lead del periodo coincide con los filtros." : "Ajusta el rango de fechas."}
        />
      </div>
    );
  }
  return (
    <>
      <div className="md:overflow-x-auto">
        <table className="responsive-table data-table w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-5 py-3">Fecha/hora</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Ruta</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Propiedad</th>
              <th className="px-4 py-3">Asesor</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Asignación</th>
              <th className="px-4 py-3">EasyBroker</th>
              <th className="px-4 py-3">Aviso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {leads.map((lead) => {
              const route = toCanonicalRoute(lead.interestType as RawInterestType);
              return (
                <tr key={lead.id} className="align-top transition-colors duration-150 hover:bg-surface-muted">
                  <td data-label="Fecha/hora" className="whitespace-nowrap px-5 py-3 text-ink-600">
                    {formatMexicoCityDateTime(new Date(lead.fechaHora))}
                  </td>
                  <td data-label="Cliente" className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-ink-900 hover:text-accent-700 hover:underline">
                      {lead.nombre || "Sin nombre"}
                    </Link>
                    <span className="block whitespace-nowrap text-xs text-ink-500">{lead.telefono || "—"}</span>
                    {lead.error && (
                      <span className="mt-0.5 block max-w-56 truncate text-[11px] text-rose-700" title={lead.error}>
                        {lead.error}
                      </span>
                    )}
                  </td>
                  <td data-label="Ruta" className="px-4 py-3 text-ink-700">
                    {ROUTE_LABELS[route]}
                    {lead.tipoInteres && lead.tipoInteres !== ROUTE_LABELS[route] && <span className="block text-xs text-ink-500">{lead.tipoInteres}</span>}
                  </td>
                  <td data-label="Origen" className="px-4 py-3 text-ink-700">
                    {lead.origen || <span className="text-ink-400">Sin especificar</span>}
                  </td>
                  <td data-label="Propiedad" className="px-4 py-3 text-ink-700">
                    {lead.propiedadId ? (
                      <Link href={`/propiedades/${lead.propiedadId}`} className="whitespace-nowrap font-medium hover:text-accent-700 hover:underline">
                        {lead.propiedadId}
                      </Link>
                    ) : (
                      <span className="block max-w-44 break-words text-xs text-ink-600">{lead.datoEnviado || "—"}</span>
                    )}
                  </td>
                  <td data-label="Asesor" className="px-4 py-3 text-ink-700">
                    {lead.asesorAsignado || <span className="text-ink-400">Sin asignar</span>}
                  </td>
                  <td data-label="Método" className="px-4 py-3 text-ink-600">
                    {lead.metodoAsignacion || "—"}
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} href={pageHref} noun="leads" />
    </>
  );
}
