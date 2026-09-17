import { requireRole } from "@/lib/dal";
import { getIntegrationReadiness } from "@/lib/env";
import { checkDatabaseConnection } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { listRecentAuditLogs } from "@/lib/services/audit.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";

function formatDate(value: Date): string {
  return value.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function IntegracionesPage() {
  await requireRole("ADMIN");

  const readiness = getIntegrationReadiness();
  const database = readiness.databaseConfigured ? await checkDatabaseConnection() : { ok: false as const };

  const companyId = await getDefaultCompanyId();
  const recentEvents = await listRecentAuditLogs(companyId, 25);

  const integrations: { name: string; description: string; status: "connected" | "configured" | "missing" }[] = [
    {
      name: "Base de datos",
      description: "Leads, asesores, asignaciones y auditoría.",
      status: !readiness.databaseConfigured ? "missing" : database.ok ? "connected" : "configured",
    },
    {
      name: "EasyBroker",
      description: "Propiedades y solicitudes de contacto.",
      status: readiness.easyBrokerConfigured ? "configured" : "missing",
    },
    {
      name: "ManyChat",
      description: "Notificaciones a asesores.",
      status: readiness.manyChatConfigured ? "configured" : "missing",
    },
    {
      name: "OpenAI",
      description: "Búsqueda inteligente de propiedades.",
      status: readiness.openAIConfigured ? "configured" : "missing",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Integraciones</h1>
        <p className="text-sm text-ink-500">Estado de las conexiones externas de la plataforma.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.name} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">{integration.name}</h3>
                <p className="mt-0.5 text-xs text-ink-500">{integration.description}</p>
              </div>
              <Badge tone={integration.status === "connected" ? "success" : integration.status === "configured" ? "gold" : "danger"}>
                {integration.status === "connected" ? "Conectado" : integration.status === "configured" ? "Configurado" : "Falta configuración"}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Actividad reciente</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <EmptyState title="Sin actividad registrada todavía" />
          ) : (
            <div className="md:overflow-x-auto">
              <table className="responsive-table w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 pr-4 font-medium">Evento</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map((event) => (
                    <tr key={event.id} className="border-b border-ink-50 last:border-0">
                      <td data-label="Fecha" className="py-2 pr-4 text-ink-600 whitespace-nowrap">{formatDate(event.createdAt)}</td>
                      <td data-label="Evento" className="py-2 pr-4 text-ink-600">{event.eventType}</td>
                      <td data-label="Estado" className="py-2 pr-4">
                        <Badge tone={event.status === "error" ? "danger" : event.status === "warning" ? "warning" : "success"}>
                          {event.status}
                        </Badge>
                      </td>
                      <td data-label="Detalle" className="py-2 pr-4 text-ink-600">{event.message || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
