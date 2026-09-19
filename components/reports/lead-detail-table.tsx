import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import { toCanonicalRoute, ROUTE_LABELS, type RawInterestType } from "@/lib/reporting/report-aggregation";
import type { LeadView } from "@/lib/types";

function statusTone(estadoLabel: string): "success" | "warning" | "danger" | "neutral" {
  if (estadoLabel === "Con error") return "danger";
  if (estadoLabel === "Recibido" || estadoLabel === "Procesando") return "warning";
  if (estadoLabel === "Completado" || estadoLabel === "Notificado") return "success";
  return "neutral";
}

export function LeadDetailTable({
  leads,
  page,
  totalPages,
  total,
  pageHref,
}: {
  leads: LeadView[];
  page: number;
  totalPages: number;
  total: number;
  pageHref: (page: number) => string;
}) {
  return (
    <div className="space-y-3">
      <Card>
        {leads.length === 0 ? (
          <div className="p-5">
            <EmptyState title="No hay leads en este periodo." description="Ajusta el rango de fechas o los filtros." />
          </div>
        ) : (
          <div className="md:overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Fecha/Hora</th>
                  <th className="px-5 py-3 font-medium">Cliente</th>
                  <th className="px-5 py-3 font-medium">Teléfono</th>
                  <th className="px-5 py-3 font-medium">Ruta</th>
                  <th className="px-5 py-3 font-medium">Interés</th>
                  <th className="px-5 py-3 font-medium">Origen</th>
                  <th className="px-5 py-3 font-medium">Propiedad</th>
                  <th className="px-5 py-3 font-medium">Asesor</th>
                  <th className="px-5 py-3 font-medium">Asignación</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">EasyBroker</th>
                  <th className="px-5 py-3 font-medium">ManyChat</th>
                  <th className="px-5 py-3 font-medium">Último error</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const route = toCanonicalRoute(lead.interestType as RawInterestType);
                  return (
                    <tr key={lead.id} className="border-b border-ink-50 last:border-0 hover:bg-surface-muted">
                      <td data-label="Fecha/Hora" className="whitespace-nowrap px-5 py-3 text-ink-600">
                        {formatMexicoCityDateTime(new Date(lead.fechaHora))}
                      </td>
                      <td data-label="Cliente" className="px-5 py-3 font-medium text-ink-900">
                        <Link href={`/leads/${lead.id}`} className="hover:text-gold-700 hover:underline">
                          {lead.nombre || "—"}
                        </Link>
                      </td>
                      <td data-label="Teléfono" className="whitespace-nowrap px-5 py-3 text-ink-600">{lead.telefono || "—"}</td>
                      <td data-label="Ruta" className="px-5 py-3 text-ink-600">{ROUTE_LABELS[route]}</td>
                      <td data-label="Interés" className="px-5 py-3 text-ink-600">{lead.tipoInteres || "—"}</td>
                      <td data-label="Origen" className="px-5 py-3 text-ink-600">{lead.origen || "—"}</td>
                      <td data-label="Propiedad" className="px-5 py-3 text-ink-600">{lead.datoEnviado || "—"}</td>
                      <td data-label="Asesor" className="px-5 py-3 text-ink-600">{lead.asesorAsignado || "Sin asignar"}</td>
                      <td data-label="Asignación" className="px-5 py-3 text-ink-600">{lead.metodoAsignacion || "—"}</td>
                      <td data-label="Estado" className="px-5 py-3">
                        <Badge tone={statusTone(lead.estado)}>{lead.estado}</Badge>
                      </td>
                      <td data-label="EasyBroker" className="px-5 py-3">
                        <Badge tone={lead.easyBrokerConfirmado ? "success" : "warning"}>
                          {lead.easyBrokerConfirmado ? "Confirmado" : "Pendiente"}
                        </Badge>
                      </td>
                      <td data-label="ManyChat" className="px-5 py-3">
                        <Badge tone={lead.manyChatNotificado ? "success" : "warning"}>
                          {lead.manyChatNotificado ? "Enviada" : "Pendiente"}
                        </Badge>
                      </td>
                      <td data-label="Último error" className="px-5 py-3 text-ink-600">
                        {lead.error ? (
                          <span className="text-rose-700" title={lead.error}>
                            {lead.error.length > 50 ? `${lead.error.slice(0, 50)}…` : lead.error}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 text-sm text-ink-600 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Página {page} de {totalPages} ({total} leads)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(page - 1)} className="rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-surface-muted">
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link href={pageHref(page + 1)} className="rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-surface-muted">
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
