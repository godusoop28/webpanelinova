import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal";
import { isDatabaseConfigured } from "@/lib/db";
import { getAutomationMode, isInternalTestingEnabled } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadSimulator } from "@/components/testing/lead-simulator";

export default async function TestingPage() {
  await requireRole("ADMIN");
  if (!isInternalTestingEnabled()) notFound();

  const dbConfigured = isDatabaseConfigured();
  const automationMode = getAutomationMode();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-ink-900">Diagnóstico interno</h1>
        <p className="text-sm text-ink-500">
          Simula un lead completo — clasificación de ruta y motor de asignación — sin enviar nada a
          EasyBroker ni ManyChat. Solo visible para administradores con acceso interno habilitado.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={dbConfigured ? "success" : "danger"}>
          Base de datos: {dbConfigured ? "conectada" : "sin conexión"}
        </Badge>
        <Badge tone={automationMode === "shadow" ? "gold" : "warning"}>
          Modo de automatización: {automationMode === "shadow" ? "simulación" : "en vivo"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Simular lead entrante</CardTitle>
            <CardDescription>
              Esta herramienta simula siempre — nunca envía una solicitud real a EasyBroker o ManyChat.
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
