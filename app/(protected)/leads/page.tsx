import { MessageCircle } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getLeadRows, type LeadRow } from "@/lib/google-sheets";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { TableSearch } from "@/components/table-search";
import { normalizePhone } from "@/lib/metrics";

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized.includes("error")) return "danger";
  if (normalized.includes("pendient")) return "warning";
  if (normalized.includes("enviad") || normalized.includes("exitos")) return "success";
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

function matchesQuery(lead: LeadRow, query: string): boolean {
  const haystack = [
    lead.nombre,
    lead.telefono,
    normalizePhone(lead.telefono),
    lead.tipoInteres,
    lead.origen,
    lead.asesorAsignado,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireSection("leads");
  const { q } = await searchParams;

  let leads: LeadRow[] = [];
  let loadError: string | null = null;
  try {
    leads = await getLeadRows();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const filtered = q ? leads.filter((lead) => matchesQuery(lead, q)) : leads;
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.fechaHora).getTime() - new Date(a.fechaHora).getTime()
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Leads</h1>
          <p className="text-sm text-ink-500">
            Solicitudes capturadas por la automatización, sincronizadas desde Google Sheets.
          </p>
        </div>
        <TableSearch placeholder="Buscar por nombre, teléfono o asesor…" />
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorState
              title="No se pudo cargar Google Sheets"
              description={loadError}
            />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Sin leads que mostrar"
              description={q ? "Ajusta tu búsqueda." : "Aún no hay registros en la hoja de leads."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">Interés</th>
                  <th className="px-5 py-3 font-medium">Origen</th>
                  <th className="px-5 py-3 font-medium">Asesor</th>
                  <th className="px-5 py-3 font-medium">Estado EasyBroker</th>
                  <th className="px-5 py-3 font-medium">Notificación</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((lead) => (
                  <tr
                    key={`${lead.rowNumber}-${lead.telefono}`}
                    className="border-b border-ink-50 last:border-0 hover:bg-surface-muted"
                  >
                    <td className="whitespace-nowrap px-5 py-3 text-ink-600">
                      {formatDate(lead.fechaHora)}
                    </td>
                    <td className="px-5 py-3 font-medium text-ink-900">{lead.nombre || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{lead.tipoInteres || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{lead.origen || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{lead.asesorAsignado || "Sin asignar"}</td>
                    <td className="px-5 py-3">
                      <Badge tone="neutral">{lead.estadoEasyBroker || "Sin dato"}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={statusTone(lead.estadoEnvioAsesor)}>
                        {lead.estadoEnvioAsesor || "Sin dato"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
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
    </div>
  );
}
