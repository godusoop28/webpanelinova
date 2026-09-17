import { requireRole } from "@/lib/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { env } from "@/lib/env";

function safeRead(read: () => string): string | null {
  try {
    return read();
  } catch {
    return null;
  }
}

export default async function ConfiguracionPage() {
  const user = await requireRole("ADMIN");
  const fallbackAgentEmail = safeRead(() => env.easybroker.fallbackAgentEmail);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Configuración</h1>
        <p className="text-sm text-ink-500">Datos generales de la organización y de tu cuenta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-ink-700">
          <p>
            <span className="text-ink-500">Rol:</span> {user.role}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Asignación de leads</CardTitle>
          <CardDescription>
            Reglas del motor de asignación. Los valores por asesor (peso, límite diario, rutas y
            pausas) se administran desde Asesores.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-ink-700">
          <p>
            <span className="text-ink-500">Correo comodín de EasyBroker:</span>{" "}
            {fallbackAgentEmail ?? "No configurado"}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Cuando una propiedad tiene este correo como agente, el lead pasa a la ruleta ponderada
            en vez de asignarse directo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles y permisos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-700">
          <p>
            <span className="font-medium text-ink-900">ADMIN</span> — acceso total, gestión de
            usuarios e integraciones.
          </p>
          <p>
            <span className="font-medium text-ink-900">DIRECCION</span> — resumen, leads,
            asesores y reportes.
          </p>
          <p>
            <span className="font-medium text-ink-900">CONSULTA</span> — resumen y reportes en
            modo lectura.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
