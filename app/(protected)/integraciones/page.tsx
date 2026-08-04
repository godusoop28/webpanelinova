import { CheckCircle2, XCircle } from "lucide-react";
import { requireRole } from "@/lib/dal";
import { getMakeEvents } from "@/lib/google-sheets";
import { getMissingEnvVars } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { SyncButton } from "@/components/integraciones/sync-button";

const INTEGRATIONS = [
  {
    name: "Google Sheets",
    vars: ["GOOGLE_PROJECT_ID", "GOOGLE_CLIENT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_SPREADSHEET_ID"],
    description: "Leads, asesores, usuarios y eventos de Make.",
  },
  {
    name: "EasyBroker",
    vars: ["EASYBROKER_API_KEY"],
    description: "Propiedades, contactos y solicitudes de contacto.",
  },
  {
    name: "Make (entrante)",
    vars: ["MAKE_WEBHOOK_SECRET"],
    description: "Recibe eventos de automatización en /api/integrations/make/events.",
  },
  {
    name: "Make (saliente)",
    vars: ["MAKE_SYNC_WEBHOOK_URL"],
    description: "Botón de sincronización manual del panel.",
  },
  {
    name: "Acceso al panel",
    vars: ["AUTH_PASSWORD", "AUTH_SECRET"],
    description: "Contraseña de inicio de sesión del panel.",
  },
];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function IntegracionesPage() {
  await requireRole("ADMIN");

  const missing = getMissingEnvVars();

  let events: Awaited<ReturnType<typeof getMakeEvents>> = [];
  let loadError: string | null = null;
  try {
    events = await getMakeEvents();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const lastSync = events.find((event) => event.escenario === "Sincronización manual");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Integraciones</h1>
        <p className="text-sm text-ink-500">
          Estado de las conexiones externas y control de la sincronización con Make.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {INTEGRATIONS.map((integration) => {
          const missingVars = integration.vars.filter((v) => missing.includes(v));
          const configured = missingVars.length === 0;
          return (
            <Card key={integration.name} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">{integration.name}</h3>
                  <p className="mt-0.5 text-xs text-ink-500">{integration.description}</p>
                </div>
                <Badge tone={configured ? "success" : "danger"}>
                  {configured ? "Configurado" : "Falta configuración"}
                </Badge>
              </div>
              {!configured && (
                <ul className="mt-3 space-y-1">
                  {missingVars.map((v) => (
                    <li key={v} className="flex items-center gap-1.5 text-xs text-rose-600">
                      <XCircle className="size-3.5" aria-hidden />
                      <code>{v}</code> no definida
                    </li>
                  ))}
                </ul>
              )}
              {configured && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Todas las variables requeridas están definidas
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sincronización manual con Make</CardTitle>
        </CardHeader>
        <CardContent>
          <SyncButton lastRunLabel={lastSync ? formatDate(lastSync.fecha) : null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registro de eventos (EventosMake)</CardTitle>
        </CardHeader>
        <CardContent>
          {loadError ? (
            <ErrorState title="No se pudo cargar Google Sheets" description={loadError} />
          ) : events.length === 0 ? (
            <EmptyState title="Sin eventos registrados todavía" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                    <th className="py-2 pr-4 font-medium">Fecha</th>
                    <th className="py-2 pr-4 font-medium">Escenario</th>
                    <th className="py-2 pr-4 font-medium">Evento</th>
                    <th className="py-2 pr-4 font-medium">Estado</th>
                    <th className="py-2 pr-4 font-medium">Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {events.slice(0, 25).map((event) => (
                    <tr key={event.rowNumber} className="border-b border-ink-50 last:border-0">
                      <td className="py-2 pr-4 text-ink-600 whitespace-nowrap">{formatDate(event.fecha)}</td>
                      <td className="py-2 pr-4 text-ink-600">{event.escenario}</td>
                      <td className="py-2 pr-4 text-ink-600">{event.evento}</td>
                      <td className="py-2 pr-4">
                        <Badge tone={event.estado.toLowerCase().includes("error") ? "danger" : "success"}>
                          {event.estado || "—"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-ink-600">{event.lead || "—"}</td>
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
