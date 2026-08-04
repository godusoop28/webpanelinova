import { requireSection } from "@/lib/dal";
import { getAdvisorRows } from "@/lib/google-sheets";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";

export default async function AsesoresPage() {
  await requireSection("asesores");

  let advisors: Awaited<ReturnType<typeof getAdvisorRows>> = [];
  let loadError: string | null = null;
  try {
    advisors = await getAdvisorRows();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Asesores</h1>
        <p className="text-sm text-ink-500">
          Equipo comercial sincronizado desde la pestaña Asesores de Google Sheets.
        </p>
      </div>

      <Card>
        {loadError ? (
          <div className="p-5">
            <ErrorState title="No se pudo cargar Google Sheets" description={loadError} />
          </div>
        ) : advisors.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Sin asesores registrados" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3 font-medium">Nombre</th>
                  <th className="px-5 py-3 font-medium">WhatsApp</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Tipo de asignación</th>
                  <th className="px-5 py-3 font-medium">Email EasyBroker</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {advisors.map((advisor) => (
                  <tr
                    key={advisor.id || advisor.rowNumber}
                    className="border-b border-ink-50 last:border-0 hover:bg-surface-muted"
                  >
                    <td className="px-5 py-3 font-medium text-ink-900">{advisor.nombre || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{advisor.whatsapp || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{advisor.rol || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{advisor.tipoAsignacion || "—"}</td>
                    <td className="px-5 py-3 text-ink-600">{advisor.emailEasyBroker || "—"}</td>
                    <td className="px-5 py-3">
                      <Badge tone={advisor.activo ? "success" : "neutral"}>
                        {advisor.activo ? "Activo" : "Inactivo"}
                      </Badge>
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
