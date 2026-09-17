import { requireRole } from "@/lib/dal";
import { isDatabaseConfigured } from "@/lib/db";
import { getAutomationMode } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadSimulator } from "@/components/testing/lead-simulator";

export default async function TestingPage() {
  await requireRole("ADMIN");

  const dbConfigured = isDatabaseConfigured();
  const automationMode = getAutomationMode();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Pruebas (shadow)</h1>
        <p className="text-sm text-ink-500">
          Simula un lead completo — clasificación de ruta, motor de asignación ponderado y qué se habría
          enviado a EasyBroker/ManyChat — sin tocar ninguna integración real.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={dbConfigured ? "success" : "danger"}>
          Base de datos: {dbConfigured ? "configurada" : "falta DATABASE_URL"}
        </Badge>
        <Badge tone={automationMode === "shadow" ? "gold" : "warning"}>
          AUTOMATION_MODE del entorno: {automationMode}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Simular lead entrante</CardTitle>
            <CardDescription>
              Esta página fuerza modo shadow siempre, sin importar AUTOMATION_MODE — nunca puede disparar una
              llamada real a EasyBroker o ManyChat (ver app/(protected)/testing/actions.ts).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LeadSimulator />
        </CardContent>
      </Card>
    </div>
  );
}
