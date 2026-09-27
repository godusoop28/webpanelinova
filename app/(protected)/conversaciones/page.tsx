import Link from "next/link";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigureAssistant } from "@/lib/permissions";
import {
  HANDOFF_LABELS,
  conversationStatus,
  countAttentionItems,
  listConversations,
  listOpenEscalations,
  type ConversationFilter,
} from "@/lib/services/conversation-admin.service";
import { effectiveMode, getAssistantSettings } from "@/lib/services/assistant-settings.service";
import { INTENT_LABELS, type ConversationIntentCode } from "@/lib/conversation/policy";
import { env } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { TableSearch } from "@/components/table-search";
import { SettingsForm } from "@/components/conversaciones/action-forms";
import { formatDateTime } from "@/components/conversaciones/conversation-view";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "attention", label: "Requieren atención" },
  { value: "all", label: "Todas" },
  { value: "ai", label: "IA activa" },
  { value: "waiting", label: "Esperando tras canalizar" },
  { value: "human", label: "Atención humana" },
  { value: "paused", label: "IA en pausa" },
  { value: "handed_off", label: "Canalizadas" },
  { value: "errors", label: "Con errores" },
  { value: "test", label: "Pruebas" },
];

const MODE_LABELS = { OFF: "Apagado", TEST_ONLY: "Solo pruebas", ON: "Activo" } as const;

function pageHref(filter: ConversationFilter, page: number, q?: string) {
  return `/conversaciones?f=${filter}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

export default async function ConversacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; f?: string }>;
}) {
  const user = await requireSection("conversaciones");
  const { q, page: pageParam, f } = await searchParams;
  const filter = FILTERS.find((item) => item.value === f)?.value ?? "attention";
  const page = Math.max(1, Number(pageParam) || 1);
  const isAdmin = canConfigureAssistant(user.role);

  let data: Awaited<ReturnType<typeof listConversations>> | null = null;
  let counts: Awaited<ReturnType<typeof countAttentionItems>> | null = null;
  let escalations: Awaited<ReturnType<typeof listOpenEscalations>> = [];
  let settings: Awaited<ReturnType<typeof getAssistantSettings>> | null = null;
  let loadError: string | null = null;
  try {
    const companyId = await getDefaultCompanyId();
    [data, counts, escalations, settings] = await Promise.all([
      listConversations({ companyId, filter, search: q, page, pageSize: PAGE_SIZE }),
      countAttentionItems(companyId),
      listOpenEscalations(companyId, 20),
      getAssistantSettings(companyId),
    ]);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Error desconocido";
  }

  const mode = settings ? effectiveMode(settings) : "OFF";
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Conversaciones</h1>
          <p className="text-sm text-ink-500">Asistente de WhatsApp: historial, lo que entendió, canalizaciones y pendientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={mode === "ON" ? "success" : mode === "TEST_ONLY" ? "gold" : "neutral"}>Asistente: {MODE_LABELS[mode]}</Badge>
          {env.assistant.killSwitch && <Badge tone="danger">Apagado por ASSISTANT_DISABLED</Badge>}
          {isAdmin && (
            <Link href="/conversaciones/simulador" className="rounded-lg border border-ink-200 bg-surface px-3 py-2 text-sm text-ink-700 hover:bg-ink-50">
              Simulador
            </Link>
          )}
        </div>
      </div>

      {loadError ? (
        <ErrorState title="No se pudieron cargar las conversaciones" description={loadError} />
      ) : (
        <>
          {counts && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-xs text-ink-500">Pendientes de gerencia / humano</p>
                <p className="text-2xl font-semibold text-ink-900">{counts.pendingEscalations}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-ink-500">Contactos con IA pausada por una persona</p>
                <p className="text-2xl font-semibold text-ink-900">{counts.humanControl}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-ink-500">Envíos fallidos o inciertos (7 días)</p>
                <p className={cn("text-2xl font-semibold", counts.deliveryIssues > 0 ? "text-rose-600" : "text-ink-900")}>{counts.deliveryIssues}</p>
              </Card>
            </div>
          )}

          {escalations.length > 0 && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Pendientes abiertos</CardTitle>
                  <CardDescription>&quot;Sin aviso&quot; significa que nadie fue notificado automáticamente.</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {escalations.map((escalation) => (
                  <Link
                    key={escalation.id}
                    href={`/conversaciones/${escalation.conversationId}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-100 px-3 py-2 text-sm hover:bg-surface-muted"
                  >
                    <Badge tone="warning">{escalation.type}</Badge>
                    {escalation.conversation.isTest && <Badge tone="gold">Prueba</Badge>}
                    <span className="font-medium text-ink-800">{escalation.conversation.name ?? escalation.conversation.phone ?? "Contacto"}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-600">{escalation.reason}</span>
                    <span className="text-xs text-ink-500">{escalation.status === "NOTIFIED" ? "avisado" : "sin aviso"}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((item) => (
              <Link
                key={item.value}
                href={pageHref(item.value, 1, q)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  item.value === filter ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                )}
              >
                {item.label}
              </Link>
            ))}
            <div className="ml-auto">
              <TableSearch placeholder="Buscar nombre, teléfono o ID…" />
            </div>
          </div>

          <Card>
            {!data || data.items.length === 0 ? (
              <div className="p-5">
                <EmptyState title="Sin conversaciones en esta vista" description={q ? "Ajusta tu búsqueda." : undefined} />
              </div>
            ) : (
              <div className="md:overflow-x-auto">
                <table className="responsive-table w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500">
                      <th className="px-5 py-3 font-medium">Actividad</th>
                      <th className="px-5 py-3 font-medium">Contacto</th>
                      <th className="px-5 py-3 font-medium">Intención</th>
                      <th className="px-5 py-3 font-medium">Estado</th>
                      <th className="px-5 py-3 font-medium">Canalización</th>
                      <th className="px-5 py-3 font-medium">Asesor</th>
                      <th className="px-5 py-3 font-medium">Último mensaje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((conversation) => (
                      <tr key={conversation.id} className="border-b border-ink-50 last:border-0 hover:bg-surface-muted">
                        <td data-label="Actividad" className="whitespace-nowrap px-5 py-3 text-ink-600">
                          {formatDateTime(conversation.lastActivityAt)}
                        </td>
                        <td data-label="Contacto" className="px-5 py-3">
                          <Link href={`/conversaciones/${conversation.id}`} className="font-medium text-ink-900 hover:text-gold-700 hover:underline">
                            {conversation.name ?? conversation.phone ?? conversation.manyChatSubscriberId}
                          </Link>
                          <div className="flex gap-1 pt-0.5">
                            {conversation.isTest && <Badge tone="gold">Prueba</Badge>}
                            {conversation._count.escalations > 0 && <Badge tone="warning">{conversation._count.escalations} pendiente(s)</Badge>}
                            {conversation.lastError && <Badge tone="danger">Error</Badge>}
                          </div>
                        </td>
                        <td data-label="Intención" className="px-5 py-3 text-ink-600">
                          {INTENT_LABELS[conversation.primaryIntent as ConversationIntentCode]}
                        </td>
                        <td data-label="Estado" className="px-5 py-3">
                          {(() => {
                            const status = conversationStatus(conversation);
                            return <Badge tone={status.tone}>{status.label}</Badge>;
                          })()}
                        </td>
                        <td data-label="Canalización" className="px-5 py-3 text-ink-600">
                          {HANDOFF_LABELS[conversation.handoffState]}
                        </td>
                        <td data-label="Asesor" className="px-5 py-3 text-ink-600">
                          {conversation.lead?.assignedAdvisor?.name ?? "—"}
                        </td>
                        <td data-label="Último mensaje" className="max-w-xs truncate px-5 py-3 text-ink-500">
                          {conversation.messages[0]?.text ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              {page > 1 && (
                <Link href={pageHref(filter, page - 1, q)} className="text-gold-700 hover:underline">
                  Anterior
                </Link>
              )}
              <span className="text-ink-500">
                Página {page} de {totalPages}
              </span>
              {page < totalPages && (
                <Link href={pageHref(filter, page + 1, q)} className="text-gold-700 hover:underline">
                  Siguiente
                </Link>
              )}
            </div>
          )}

          {isAdmin && settings && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Configuración del asistente</CardTitle>
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
        </>
      )}
    </div>
  );
}
