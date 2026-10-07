import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { getAssistantSettings } from "@/lib/services/assistant-settings.service";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/state";
import { SettingsForm } from "@/components/conversaciones/action-forms";

export default async function AjustesAsistentePage() {
  await requireRole("ADMIN");

  let settings: Awaited<ReturnType<typeof getAssistantSettings>> | null = null;
  let loadError: string | null = null;
  try {
    settings = await getAssistantSettings(await getDefaultCompanyId());
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink-950 sm:text-[28px] sm:leading-9">Configuración del asistente</h1>
          {env.assistant.killSwitch && <Badge tone="danger">Apagado por ASSISTANT_DISABLED</Badge>}
        </div>
        <p className="text-sm text-ink-500">Modo, tiempos de respuesta, contactos de prueba y destinatarios de gerencia.</p>
      </div>

      {loadError || !settings ? (
        <ErrorState title="No se pudo cargar la configuración" description={loadError ?? undefined} />
      ) : (
        <Card className="max-w-3xl">
          <CardHeader>
            <div>
              <CardTitle>Ajustes generales</CardTitle>
              <CardDescription>
                Solo ADMIN. Apagarlo devuelve a los clientes al flujo anterior de ManyChat sin tocar ManyChat. Interruptor de emergencia en el hosting:
                ASSISTANT_DISABLED=true.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <SettingsForm settings={settings} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
