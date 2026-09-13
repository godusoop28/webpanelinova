import { requireRole } from "@/lib/dal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { env, isDemoModeActive } from "@/lib/env";

function safeRead(read: () => string): string | null {
  try {
    return read();
  } catch {
    return null;
  }
}

export default async function ConfiguracionPage() {
  const user = await requireRole("ADMIN");

  const spreadsheetId = safeRead(() => env.google.spreadsheetId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Configuración</h1>
        <p className="text-sm text-ink-500">Datos generales de la organización y de tu cuenta.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
          <CardDescription>
            {isDemoModeActive()
              ? "Modo demostración: sesión automática, sin contraseña."
              : "Sesión iniciada con la contraseña de acceso al panel."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-ink-700">
          <p>
            <span className="text-ink-500">Rol:</span> {user.role}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fuente de datos</CardTitle>
          <CardDescription>
            Google Sheet conectado como fuente de leads, asesores y usuarios.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-ink-700">
          {spreadsheetId ? (
            <a
              href={`https://docs.google.com/spreadsheets/d/${spreadsheetId}`}
              target="_blank"
              rel="noreferrer"
              className="text-gold-700 hover:text-gold-600"
            >
              Abrir Google Sheet →
            </a>
          ) : (
            <p className="text-ink-500">
              GOOGLE_SPREADSHEET_ID no está configurado. Ve a Integraciones para más detalle.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles y permisos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-700">
          <p>
            <span className="font-medium text-ink-900">ADMIN</span> — acceso total, gestión de
            usuarios, integraciones y sincronizaciones.
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
