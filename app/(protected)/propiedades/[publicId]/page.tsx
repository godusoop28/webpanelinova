import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigurePropertyReports, canManagePropertyFollowUp } from "@/lib/permissions";
import { formatMexicoCityDateTime, mexicoCityDateKey } from "@/lib/timezone";
import { resolveDateRange, presetFromSearchParams, InvalidDateRangeError } from "@/lib/reporting/date-range";
import {
  EVENT_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  formatEventDate,
  recipientBlockers,
  weeklyPeriodFor,
  type SourceCount,
} from "@/lib/reporting/property-report";
import { PORTAL_LABELS } from "@/lib/conversation/property-reference";
import { buildWeeklyReportFor, getPropertyReportDetail, getReportSettings, maskContact, settingsBlockers } from "@/lib/services/property-report.service";
import { DateRangeFilter } from "@/components/date-range-filter";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { EventForm, NewRecipientForm, RecipientControls } from "@/components/propiedades/forms";

const METHOD_LABELS: Record<string, string> = {
  code_in_message: "Código en el mensaje",
  code_in_url: "Código en el enlace",
  easybroker_link: "Enlace de EasyBroker",
  portal_listing: "Anuncio del portal (reportado por EasyBroker)",
  portal_page_code: "Código en la página del portal",
  internal_code: "Clave interna en el anuncio",
  confirmed_candidate: "Confirmada por el cliente",
  get_property: "Consultada en la conversación",
  handoff: "Canalización",
  lead_property_code: "Lead de propiedad/campaña",
};

const DELIVERY_STATUS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "gold" }> = {
  PENDING: { label: "Pendiente", tone: "warning" },
  SENDING: { label: "Enviando", tone: "warning" },
  SENT: { label: "Enviado", tone: "success" },
  FAILED: { label: "Fallido", tone: "danger" },
  UNCERTAIN: { label: "Incierto", tone: "danger" },
  SKIPPED: { label: "No enviado", tone: "neutral" },
};

function SourceList({ title, rows }: { title: string; rows: SourceCount[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-500">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-400">—</p>
      ) : (
        <ul className="text-sm text-ink-800">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-3">
              <span>{row.label}</span>
              <span className="font-medium">{row.contacts}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}) {
  const user = await requireSection("propiedades");
  const { publicId: rawId } = await params;
  const query = await searchParams;
  const publicId = decodeURIComponent(rawId).toUpperCase();
  const { preset, custom } = presetFromSearchParams({ ...query, range: query.range ?? "this_week" });
  const canManage = canManagePropertyFollowUp(user.role);
  const canConfigure = canConfigurePropertyReports(user.role);

  let detail: Awaited<ReturnType<typeof getPropertyReportDetail>> | null = null;
  let preview: Awaited<ReturnType<typeof buildWeeklyReportFor>> | null = null;
  let previewPeriodLabel = "";
  let settingsIssues: string[] = [];
  let rangeLabel = "";
  let error: string | null = null;
  try {
    const range = resolveDateRange(preset, custom);
    rangeLabel = range.label;
    const companyId = await getDefaultCompanyId();
    const settings = await getReportSettings(companyId);
    const period = weeklyPeriodFor(new Date(), settings.weeklyWeekday);
    previewPeriodLabel = period.label;
    [detail, preview] = await Promise.all([
      getPropertyReportDetail({ companyId, publicId, startKey: mexicoCityDateKey(range.startDate), endKey: mexicoCityDateKey(range.endDate) }),
      buildWeeklyReportFor(companyId, publicId, period),
    ]);
    settingsIssues = settingsBlockers(settings, "weekly");
  } catch (e) {
    error = e instanceof InvalidDateRangeError ? e.message : e instanceof Error ? e.message : "Error desconocido";
  }

  if (error || !detail) {
    return <ErrorState title="No se pudo cargar la propiedad" description={error ?? undefined} />;
  }
  const { property, metrics, events, recipients, deliveries, inquiries, portalListings } = detail;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link href="/propiedades" className="text-xs text-ink-500 hover:underline">
            ← Propiedades
          </Link>
          <h1 className="text-xl font-semibold text-ink-900">
            {publicId} {property?.title ? `· ${property.title}` : ""}
          </h1>
          <p className="text-sm text-ink-500">
            {property?.location ?? "Sin ubicación en el índice"}
            {property?.publicUrl && (
              <>
                {" · "}
                <a href={property.publicUrl} target="_blank" rel="noreferrer" className="text-accent-700 hover:underline">
                  Ficha pública
                </a>
              </>
            )}
          </p>
        </div>
        <DateRangeFilter current={preset} />
      </div>

      <p className="text-xs text-ink-500">Periodo: {rangeLabel}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-ink-500">Leads únicos del periodo</p>
          <p className="text-2xl font-semibold text-ink-900">{metrics?.periodLeads ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">Acumulado (hasta el fin del periodo)</p>
          <p className="text-2xl font-semibold text-ink-900">{metrics?.cumulativeLeads ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">Consultas (contacto-día)</p>
          <p className="text-2xl font-semibold text-ink-900">{metrics?.periodInquiries ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">Mensajes sobre la propiedad</p>
          <p className="text-2xl font-semibold text-ink-900">{metrics?.periodMessages ?? 0}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Procedencia (personas distintas del periodo)</CardTitle>
                <CardDescription>Sin evidencia se muestra &quot;No identificado&quot;. El portal de un enlace pegado no prueba la fuente de adquisición.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SourceList title="Canal de contacto" rows={metrics?.channels ?? []} />
              <SourceList title="Portal del enlace compartido" rows={metrics?.linkPortals ?? []} />
              <SourceList title="Fuente / campaña de adquisición (con evidencia)" rows={metrics?.acquisition ?? []} />
              <SourceList title="Fuente declarada por el cliente" rows={metrics?.declared ?? []} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Consultas registradas en el periodo</CardTitle>
                <CardDescription>Una fila por persona y día. Teléfonos enmascarados.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {inquiries.length === 0 ? (
                <EmptyState title="Sin consultas en el periodo" />
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <th className="py-2 pr-3 font-medium">Día</th>
                      <th className="py-2 pr-3 font-medium">Contacto</th>
                      <th className="py-2 pr-3 font-medium">Identificación</th>
                      <th className="py-2 pr-3 font-medium">Asesor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inquiries.map((inquiry) => (
                      <tr key={inquiry.id} className="border-b border-ink-50 last:border-0">
                        <td className="py-2 pr-3 whitespace-nowrap text-ink-600">{inquiry.day}</td>
                        <td className="py-2 pr-3">
                          {canManage && inquiry.conversationId ? (
                            <Link href={`/conversaciones/${inquiry.conversationId}`} className="text-accent-700 hover:underline">
                              {maskContact(inquiry.contactKey)}
                            </Link>
                          ) : (
                            maskContact(inquiry.contactKey)
                          )}
                          {inquiry.isTest && <Badge tone="gold">Prueba</Badge>}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-600">
                          {METHOD_LABELS[inquiry.method] ?? inquiry.method}
                          {inquiry.linkPortal && ` · ${PORTAL_LABELS[inquiry.linkPortal] ?? inquiry.linkPortal}`}
                          {inquiry.messageCount > 1 && ` · ${inquiry.messageCount} mensajes`}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink-600">{inquiry.lead?.assignedAdvisor?.name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Actividades</CardTitle>
                <CardDescription>
                  La API de EasyBroker no expone citas ni Open House: se registran aquí (origen &quot;Panel&quot;). Programada ≠ realizada.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {events.length === 0 ? (
                <p className="text-sm text-ink-500">Sin actividades registradas.</p>
              ) : (
                <ul className="space-y-3">
                  {events.map((event) => (
                    <li key={event.id} className="rounded-lg border border-ink-100 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Badge tone={event.status === "DONE" ? "success" : event.status === "CANCELLED" ? "neutral" : "gold"}>{EVENT_STATUS_LABELS[event.status]}</Badge>
                        <span className="font-medium text-ink-900">{EVENT_TYPE_LABELS[event.type]}</span>
                        <span className="text-ink-700">{event.title}</span>
                        <span className="text-xs text-ink-500">
                          {event.status === "DONE" ? `realizada ${formatEventDate(event.completedAt ?? event.scheduledAt)}` : formatEventDate(event.scheduledAt)}
                        </span>
                        <Badge tone="neutral">{event.origin === "panel" ? "Panel" : "EasyBroker"}</Badge>
                        <span className="text-xs text-ink-400">v{event.version}</span>
                      </div>
                      {event.description && <p className="mt-1 text-xs text-ink-600">{event.description}</p>}
                      {event.outcome && <p className="mt-1 text-xs text-ink-800">Registro: {event.outcome}</p>}
                      {canManage && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-accent-700">Editar / cambiar estado</summary>
                          <div className="pt-3">
                            <EventForm publicId={publicId} event={event} />
                          </div>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <details className="rounded-lg border border-dashed border-ink-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-800">Registrar actividad</summary>
                  <div className="pt-3">
                    <EventForm publicId={publicId} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Vista previa del reporte del viernes</CardTitle>
                <CardDescription>Periodo {previewPeriodLabel}. Conteos calculados en el backend.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <pre className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-xs text-ink-800">{preview?.text}</pre>
              {settingsIssues.length > 0 && <p className="text-xs text-amber-700">Envío programado no activo: {settingsIssues.join("; ")}.</p>}
            </CardContent>
          </Card>

          {canManage ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Destinatarios del inmueble</CardTitle>
                  <CardDescription>Propietario o quien designe. Separado de los prospectos. Sin autorización y verificación no se envía nada.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {recipients.map((recipient) => {
                  const blockers = recipientBlockers(recipient, "test");
                  return (
                    <div key={recipient.id} className="rounded-lg border border-ink-100 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink-900">{recipient.name}</span>
                        <span className="text-xs text-ink-500">
                          {recipient.relation} · {recipient.phoneE164}
                        </span>
                        {!recipient.active && <Badge tone="neutral">Inactivo</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={recipient.consentStatus === "GRANTED" ? "success" : recipient.consentStatus === "REVOKED" ? "danger" : "warning"}>
                          {recipient.consentStatus === "GRANTED" ? "Autorizó" : recipient.consentStatus === "REVOKED" ? "Autorización revocada" : "Sin autorización"}
                        </Badge>
                        <Badge tone={recipient.verifiedAt ? "success" : "warning"}>{recipient.verifiedAt ? "Verificado en ManyChat" : "Sin verificar"}</Badge>
                        {recipient.weeklyReport && <Badge tone="gold">Reporte semanal</Badge>}
                        {recipient.eventNotifications && <Badge tone="gold">Avisos</Badge>}
                      </div>
                      {recipient.consentEvidence && <p className="mt-1 text-xs text-ink-500">Autorización: {recipient.consentEvidence}</p>}
                      {recipient.verificationNote && <p className="mt-1 text-xs text-ink-500">{recipient.verificationNote}</p>}
                      <p className="mt-1 text-xs text-ink-500">
                        Último envío: {recipient.lastSentAt ? formatMexicoCityDateTime(recipient.lastSentAt) : "—"}
                        {recipient.lastSendStatus && ` · ${DELIVERY_STATUS[recipient.lastSendStatus]?.label ?? recipient.lastSendStatus}`}
                      </p>
                      {recipient.lastError && <p className="text-xs text-rose-600">{recipient.lastError}</p>}
                      {blockers.length > 0 && <p className="text-xs text-amber-700">Aún no puede recibir: {blockers.join("; ")}.</p>}
                      <RecipientControls recipient={recipient} publicId={publicId} canSendTest={canConfigure} />
                    </div>
                  );
                })}
                <details className="rounded-lg border border-dashed border-ink-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink-800">Agregar destinatario</summary>
                  <div className="pt-3">
                    <NewRecipientForm publicId={publicId} />
                  </div>
                </details>
              </CardContent>
            </Card>
          ) : (
            <Card className="p-4 text-xs text-ink-500">{recipients.length} destinatario(s) configurado(s). Los datos de contacto solo los ven ADMIN y DIRECCIÓN.</Card>
          )}

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Historial de envíos</CardTitle>
                <CardDescription>Reportes, avisos y pruebas con su estado real.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {deliveries.length === 0 ? (
                <p className="text-sm text-ink-500">Sin envíos.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {deliveries.map((delivery) => (
                    <li key={delivery.id} className="rounded border border-ink-100 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={DELIVERY_STATUS[delivery.status].tone}>{DELIVERY_STATUS[delivery.status].label}</Badge>
                        <span className="font-medium text-ink-800">
                          {delivery.kind === "WEEKLY_REPORT" ? "Reporte semanal" : delivery.kind === "EVENT_NOTICE" ? "Aviso de actividad" : "Prueba"}
                        </span>
                        <span className="text-ink-500">{canManage ? delivery.recipient.name : "Destinatario"}</span>
                        <span className="text-ink-400">{formatMexicoCityDateTime(delivery.sentAt ?? delivery.createdAt)}</span>
                      </div>
                      {delivery.lastError && <p className="mt-1 text-rose-600">{delivery.lastError}</p>}
                      <details>
                        <summary className="cursor-pointer text-ink-500">Texto</summary>
                        <pre className="whitespace-pre-wrap text-ink-700">{delivery.text}</pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Anuncios en portales</CardTitle>
                <CardDescription>Reportados por EasyBroker; sirven para identificar enlaces con certeza.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {portalListings.length === 0 ? (
                <p className="text-sm text-ink-500">EasyBroker no reporta anuncios con enlace para esta propiedad.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {portalListings.map((listing) => (
                    <li key={listing.id} className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-800">{PORTAL_LABELS[listing.portal] ?? listing.portalName}</span>
                      {listing.listingUrl ? (
                        <a href={listing.listingUrl} target="_blank" rel="noreferrer" className="truncate text-accent-700 hover:underline">
                          {listing.externalKey}
                        </a>
                      ) : (
                        <span className="text-ink-500">{listing.externalKey}</span>
                      )}
                      {!listing.published && <Badge tone="neutral">No publicado</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
