import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { getLeadDetail } from "@/lib/services/lead-view.service";
import { listAdvisorViews } from "@/lib/services/advisor.service";
import { leadStatusLabel } from "@/lib/lead-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeadActionsPanel } from "@/components/leads/lead-actions-panel";

function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  const normalized = status.toLowerCase();
  if (normalized === "failed" || normalized.includes("error")) return "danger";
  if (normalized === "received" || normalized === "processing" || normalized === "pending") return "warning";
  if (normalized === "completed" || normalized === "notified" || normalized === "confirmed") return "success";
  return "neutral";
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("leads");

  const { id } = await params;
  const detail = await getLeadDetail(id);
  if (!detail) notFound();

  const { lead, assignments, auditLogs } = detail;
  const digits = lead.phone.replace(/\D/g, "");

  const companyId = await getDefaultCompanyId();
  const advisors = await listAdvisorViews(companyId);
  const reassignOptions = advisors.filter((a) => a.activo).map((a) => ({ id: a.id, nombre: a.nombre }));

  return (
    <div className="space-y-5">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
        <ArrowLeft className="size-3.5" aria-hidden />
        Volver a leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">{lead.name}</h1>
          <p className="text-sm text-ink-500">{lead.phone}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(lead.status)}>{leadStatusLabel(lead.status)}</Badge>
          <Badge tone="neutral">{lead.interestType}</Badge>
          {digits && (
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-gold-700 hover:bg-surface-muted"
            >
              <MessageCircle className="size-3.5" aria-hidden />
              WhatsApp
            </a>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3 text-sm sm:grid-cols-2 md:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-500">Ruta</dt>
              <dd className="text-ink-800">{lead.route || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Origen</dt>
              <dd className="text-ink-800">{lead.origin || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Recibido</dt>
              <dd className="text-ink-800">{formatDateTime(lead.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Dato de propiedad</dt>
              <dd className="text-ink-800">{lead.propertyData || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Asesor asignado</dt>
              <dd className="text-ink-800">{lead.assignedAdvisor?.name ?? "Sin asignar"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gestión</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadActionsPanel leadId={lead.id} currentStatus={lead.status} advisors={reassignOptions} />
        </CardContent>
      </Card>

      {assignments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Asignaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 p-3 text-sm">
                  <span className="font-medium text-ink-900">{assignment.advisor.name}</span>
                  <Badge tone="neutral">{assignment.method}</Badge>
                  <Badge tone={statusTone(assignment.status)}>{assignment.status}</Badge>
                  <span className="text-xs text-ink-500">peso {assignment.weightAtAssignment}</span>
                  <span className="text-xs text-ink-500">{formatDateTime(assignment.assignedAt)}</span>
                  {assignment.easyBrokerConfirmed && <Badge tone="success">EasyBroker confirmado</Badge>}
                  {assignment.manyChatNotified && <Badge tone="success">ManyChat notificado</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-ink-500">Sin eventos registrados.</p>
          ) : (
            <ol className="space-y-2 border-l border-ink-100 pl-4">
              {auditLogs.map((event) => (
                <li key={event.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-ink-300" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink-900">{event.eventType}</span>
                    <Badge tone={statusTone(event.status)}>{event.status}</Badge>
                    <span className="text-xs text-ink-500">{formatDateTime(event.createdAt)}</span>
                  </div>
                  {event.message && <p className="text-ink-600">{event.message}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
