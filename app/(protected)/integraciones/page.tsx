import { requireRole } from "@/lib/dal";
import { getIntegrationReadiness } from "@/lib/env";
import { checkDatabaseConnection } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { listRecentAuditLogs } from "@/lib/services/audit.service";
import { Bot, Building2, Database, MessagesSquare, ScrollText, type LucideIcon } from "lucide-react";
import { Card, SectionHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/state";

function formatDate(value: Date): string {
  return value.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
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

  const integrations: { name: string; description: string; icon: LucideIcon; status: "connected" | "configured" | "missing" }[] = [
    {
      name: "Base de datos",
      icon: Database,
      description: "Leads, asesores, asignaciones y auditoría.",
      status: !readiness.databaseConfigured ? "missing" : database.ok ? "connected" : "configured",
    },
    {
      name: "EasyBroker",
      icon: Building2,
      description: "Propiedades y solicitudes de contacto.",
      status: readiness.easyBrokerConfigured ? "configured" : "missing",
    },
    {
      name: "ManyChat",
      icon: MessagesSquare,
      description: "Notificaciones a asesores.",
      status: readiness.manyChatConfigured ? "configured" : "missing",
    },
    {
      name: "OpenAI",
      icon: Bot,
      description: "Búsqueda inteligente de propiedades.",
      status: readiness.openAIConfigured ? "configured" : "missing",
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Integraciones" description="Estado de las conexiones externas de la plataforma. Las credenciales viven en el servidor y no se muestran." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {integrations.map((integration) => {
          const Icon = integration.icon;
          return (
            <Card key={integration.name} className="flex items-start gap-4 p-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                <Icon className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="text-sm font-semibold text-ink-950">{integration.name}</h2>
                <p className="text-xs text-ink-500">{integration.description}</p>
                <Badge tone={integration.status === "connected" ? "success" : integration.status === "configured" ? "info" : "danger"} dot>
                  {integration.status === "connected" ? "Conectado" : integration.status === "configured" ? "Configurado" : "Falta configuración"}
                </Badge>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <SectionHeader icon={ScrollText} title="Actividad reciente" description="Últimos 25 eventos de auditoría." />
        {recentEvents.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Sin actividad registrada todavía" />
          </div>
        ) : (
          <div className="md:overflow-x-auto">
            <table className="responsive-table data-table w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-4 py-3">Evento</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {recentEvents.map((event) => (
                  <tr key={event.id} className="align-top transition-colors duration-150 hover:bg-surface-muted">
                    <td data-label="Fecha" className="whitespace-nowrap px-5 py-3 text-ink-600">{formatDate(event.createdAt)}</td>
                    <td data-label="Evento" className="px-4 py-3 font-medium text-ink-800">{event.eventType}</td>
                    <td data-label="Estado" className="px-4 py-3">
                      <Badge tone={event.status === "error" ? "danger" : event.status === "warning" ? "warning" : "success"} dot>
                        {event.status === "error" ? "Error" : event.status === "warning" ? "Advertencia" : event.status === "success" ? "Correcto" : event.status}
                      </Badge>
                    </td>
                    <td data-label="Detalle" className="max-w-xl px-4 py-3 text-ink-600">{event.message || "—"}</td>
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
