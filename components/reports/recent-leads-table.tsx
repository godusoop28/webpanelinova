import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/state";
import { LeadStatusBadge } from "@/components/leads/lead-badges";
import { formatMexicoCityDateTime } from "@/lib/timezone";
import { toCanonicalRoute, ROUTE_LABELS, type RawInterestType } from "@/lib/reporting/report-aggregation";
import type { LeadView } from "@/lib/types";

/** Vista compacta para Resumen; la tabla filtrable completa vive en /reportes y /leads. */
export function RecentLeadsTable({ leads }: { leads: LeadView[] }) {
  if (leads.length === 0) {
    return (
      <div className="px-5 pb-5">
        <EmptyState title="No hay leads en este periodo." />
      </div>
    );
  }
  return (
    <div className="md:overflow-x-auto">
      <table className="responsive-table data-table w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-5 py-2.5">Fecha/hora</th>
            <th className="px-5 py-2.5">Cliente</th>
            <th className="px-5 py-2.5">Ruta</th>
            <th className="px-5 py-2.5">Asesor</th>
            <th className="px-5 py-2.5">Estado</th>
            <th className="px-5 py-2.5">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="transition-colors duration-150 hover:bg-surface-muted">
              <td data-label="Fecha/hora" className="whitespace-nowrap px-5 py-3 text-ink-600">
                {formatMexicoCityDateTime(new Date(lead.fechaHora))}
              </td>
              <td data-label="Cliente" className="px-5 py-3 font-medium text-ink-900">
                <Link href={`/leads/${lead.id}`} className="hover:text-accent-700 hover:underline">
                  {lead.nombre || "—"}
                </Link>
              </td>
              <td data-label="Ruta" className="px-5 py-3 text-ink-600">
                {ROUTE_LABELS[toCanonicalRoute(lead.interestType as RawInterestType)]}
              </td>
              <td data-label="Asesor" className="px-5 py-3 text-ink-600">
                {lead.asesorAsignado || <span className="text-ink-400">Sin asignar</span>}
              </td>
              <td data-label="Estado" className="px-5 py-3">
                <LeadStatusBadge label={lead.estado} />
              </td>
              <td className="px-5 py-3 text-right">
                <Link
                  href={`/leads/${lead.id}`}
                  className="inline-flex size-8 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800"
                  aria-label={`Ver lead de ${lead.nombre}`}
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
