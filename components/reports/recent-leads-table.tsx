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

/** Compact preview for the dashboard — the full, filterable table lives on /reportes. */
export function RecentLeadsTable({ leads }: { leads: LeadView[] }) {
  return (
    <Card>
      {leads.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No hay leads en este periodo." />
        </div>
      ) : (
        <div className="md:overflow-x-auto">
          <table className="responsive-table w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                <th className="px-5 py-3 font-medium">Fecha/Hora</th>
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Ruta</th>
                <th className="px-5 py-3 font-medium">Asesor</th>
                <th className="px-5 py-3 font-medium">Estado</th>
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
                    <td data-label="Ruta" className="px-5 py-3 text-ink-600">{ROUTE_LABELS[route]}</td>
                    <td data-label="Asesor" className="px-5 py-3 text-ink-600">{lead.asesorAsignado || "Sin asignar"}</td>
                    <td data-label="Estado" className="px-5 py-3">
                      <Badge tone={statusTone(lead.estado)}>{lead.estado}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
