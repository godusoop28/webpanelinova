import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { isWeeklyDue, weeklyPeriodFor } from "@/lib/reporting/property-report";
import { getReportSettings, ownerFieldIds, settingsBlockers } from "@/lib/services/property-report.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportSettingsForm } from "@/components/propiedades/forms";
import { OWNER_TEMPLATES } from "@/lib/reporting/owner-templates";

export default async function PropertyReportSettingsPage() {
  await requireRole("ADMIN");
  const settings = await getReportSettings(await getDefaultCompanyId());
  const weeklyIssues = settingsBlockers(settings, "weekly");
  const eventIssues = settingsBlockers(settings, "event");
  const period = weeklyPeriodFor(new Date(), settings.weeklyWeekday);
  const dueNow = isWeeklyDue(new Date(), { weekday: settings.weeklyWeekday, hour: settings.weeklyHour, minute: settings.weeklyMinute });

  return (
    <div className="space-y-5">
      <div>
        <Link href="/propiedades" className="text-xs text-ink-500 hover:underline">
          ← Propiedades
        </Link>
        <h1 className="text-xl font-semibold text-ink-900">Reporte de los viernes y avisos a propietarios</h1>
        <p className="text-sm text-ink-500">
          Solo ADMIN. Todo inicia apagado. Periodo que se reportaría hoy: {period.label} (viernes a jueves, Ciudad de México).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="p-4 text-sm">
          <p className="font-medium text-ink-900">Reporte semanal</p>
          {weeklyIssues.length === 0 ? (
            <Badge tone="success">Listo para enviar{dueNow ? " (ya toca hoy)" : ""}</Badge>
          ) : (
            <p className="text-xs text-amber-700">No activo: {weeklyIssues.join("; ")}.</p>
          )}
        </Card>
        <Card className="p-4 text-sm">
          <p className="font-medium text-ink-900">Avisos de actividad</p>
          {eventIssues.length === 0 ? <Badge tone="success">Activos</Badge> : <p className="text-xs text-amber-700">No activos: {eventIssues.join("; ")}.</p>}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Configuración</CardTitle>
            <CardDescription>
              Los mensajes salen fuera de la ventana de 24 h de WhatsApp, así que requieren una plantilla aprobada por Meta dentro de un flujo de ManyChat. El
              backend llena los campos personalizados y lanza el flujo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ReportSettingsForm settings={settings} fieldIds={ownerFieldIds(settings)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Plantillas para someter a aprobación (ManyChat → WhatsApp → Plantillas)</CardTitle>
            <CardDescription>Categoría Utilidad, idioma español (MEX). Cada variable se llena con un campo personalizado (una línea).</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {OWNER_TEMPLATES.map((template) => (
            <div key={template.name}>
              <p className="text-sm font-medium text-ink-900">
                {template.name} <span className="text-xs font-normal text-ink-500">· {template.purpose}</span>
              </p>
              <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-xs text-ink-800">{template.body}</pre>
              <p className="mt-1 text-xs text-ink-500">Campos: {template.fields.join(", ")}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
