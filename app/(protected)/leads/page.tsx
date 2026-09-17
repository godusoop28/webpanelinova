import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { listLeadRows } from "@/lib/services/lead-view.service";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { TableSearch } from "@/components/table-search";

const PAGE_SIZE = 50;

function statusTone(estadoLabel: string): "success" | "warning" | "danger" | "neutral" {
  if (estadoLabel === "Con error") return "danger";
  if (estadoLabel === "Recibido" || estadoLabel === "Procesando") return "warning";
  if (estadoLabel === "Completado" || estadoLabel === "Notificado") return "success";
  return "neutral";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  await requireSection("leads");
  const { q, page: pageParam, status } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  let leads: Awaited<ReturnType<typeof listLeadRows>>["leads"] = [];
  let loadError: string | null = null;
  let total = 0;
  try {
    const companyId = await getDefaultCompanyId();
    const result = await listLeadRows({ companyId, search: q, status }, page, PAGE_SIZE);
    leads = result.leads;
    total = result.total;
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = { ...(q ? { q } : {}), ...(status ? { status } : {}) };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Leads</h1>
          <p className="text-sm text-ink-500">Solicitudes recibidas y su estado de asignación.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TableSearch placeholder="Buscar por nombre o teléfono…" />
          <form method="GET" className="flex items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            <select
              name="status"
              defaultValue={status ?? ""}
              className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700"
            >
              <option value="">Todos los estados</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </form>
        </div>
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorState title="No se pudieron cargar los leads" description={loadError} />
          </div>
        ) : leads.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sin leads que mostrar" description={q || status ? "Ajusta tu búsqueda." : "Aún no hay leads registrados."} />
          </div>
        ) : (
          <div className="md:overflow-x-auto">
            <table className="responsive-table w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Interés</th>
                  <th className="px-5 py-3 font-medium">Origen</th>
                  <th className="px-5 py-3 font-medium">Asesor</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Notificación</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-ink-50 last:border-0 hover:bg-surface-muted">
                    <td data-label="Fecha" className="whitespace-nowrap px-5 py-3 text-ink-600">
                      {formatDate(lead.fechaHora)}
                    </td>
                    <td data-label="Nombre" className="px-5 py-3 font-medium text-ink-900">
                      <Link href={`/leads/${lead.id}`} className="hover:text-gold-700 hover:underline">
                        {lead.nombre || "—"}
                      </Link>
                    </td>
                    <td data-label="Interés" className="px-5 py-3 text-ink-600">{lead.tipoInteres || "—"}</td>
                    <td data-label="Origen" className="px-5 py-3 text-ink-600">{lead.origen || "—"}</td>
                    <td data-label="Asesor" className="px-5 py-3 text-ink-600">{lead.asesorAsignado || "Sin asignar"}</td>
                    <td data-label="Estado" className="px-5 py-3">
                      <Badge tone={statusTone(lead.estado)}>{lead.estado}</Badge>
                    </td>
                    <td data-label="Notificación" className="px-5 py-3">
                      <Badge tone={lead.manyChatNotificado ? "success" : "warning"}>
                        {lead.manyChatNotificado ? "Enviada" : "Pendiente"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-left md:text-right">
                      {lead.linkWhatsappCliente && (
                        <a
                          href={lead.linkWhatsappCliente}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gold-700 hover:text-gold-600"
                        >
                          <MessageCircle className="size-3.5" aria-hidden />
                          WhatsApp
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-600">
          <span>
            Página {page} de {totalPages} ({total} leads)
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/leads?${new URLSearchParams({ ...baseParams, page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-surface-muted"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/leads?${new URLSearchParams({ ...baseParams, page: String(page + 1) }).toString()}`}
                className="rounded-lg border border-ink-200 px-3 py-1.5 hover:bg-surface-muted"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
