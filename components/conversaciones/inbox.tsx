import Link from "next/link";
import { AlertTriangle, BotOff, FlaskConical, MessageSquareWarning, MessagesSquare, SlidersHorizontal, UserSquare2 } from "lucide-react";
import { getDefaultCompanyId } from "@/lib/company";
import { env } from "@/lib/env";
import {
  conversationStatus,
  countAttentionItems,
  listAdvisorThreads,
  listConversations,
  type ConversationFilter,
} from "@/lib/services/conversation-admin.service";
import { effectiveMode, getAssistantSettings } from "@/lib/services/assistant-settings.service";
import { escalationTypeLabel } from "@/lib/conversation/escalation-labels";
import { formatListTime } from "@/components/conversaciones/conversation-view";
import { AutoRefresh, FolderSelect, InboxSearch, InboxTabs, ScrollMemory } from "@/components/conversaciones/inbox-client";
import { Avatar } from "@/components/ui/avatar";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 40;

export type InboxTab = "clientes" | "asesores";

export const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "attention", label: "Requieren atención" },
  { value: "ai", label: "IA activa" },
  { value: "waiting", label: "Esperando tras canalizar" },
  { value: "human", label: "Atención humana" },
  { value: "paused", label: "IA en pausa" },
  { value: "handed_off", label: "Canalizadas" },
  { value: "errors", label: "Con errores de envío" },
  { value: "test", label: "Pruebas" },
];

const MODE_LABELS = { OFF: "Asistente apagado", TEST_ONLY: "Asistente solo pruebas", ON: "Asistente activo" } as const;

export interface InboxParams {
  tab: InboxTab;
  filter: ConversationFilter;
  q?: string;
  page: number;
}

export function parseInboxParams(searchParams: { tab?: string; f?: string; q?: string; page?: string }, forcedTab?: InboxTab): InboxParams {
  return {
    tab: forcedTab ?? (searchParams.tab === "asesores" ? "asesores" : "clientes"),
    filter: FILTERS.find((item) => item.value === searchParams.f)?.value ?? "all",
    q: searchParams.q?.trim() || undefined,
    page: Math.max(1, Number(searchParams.page) || 1),
  };
}

export function inboxQuery(params: InboxParams, overrides: Partial<InboxParams> = {}): string {
  const merged = { ...params, ...overrides };
  const query = new URLSearchParams();
  if (merged.tab === "asesores") query.set("tab", "asesores");
  else if (merged.filter !== "all") query.set("f", merged.filter);
  if (merged.q) query.set("q", merged.q);
  if (merged.page > 1 && merged.tab === "clientes") query.set("page", String(merged.page));
  const text = query.toString();
  return text ? `?${text}` : "";
}

const ROLE_PREFIX: Record<string, string> = { ASSISTANT: "IA: ", HUMAN_AGENT: "Equipo: ", SYSTEM: "Sistema: ", USER: "" };

/**
 * Página de Conversaciones: encabezado, indicadores y tres columnas
 * (lista | historial | contexto). En móvil: lista → chat → contexto.
 */
export async function InboxPage({
  params,
  isAdmin,
  hasSelection,
  selectedId,
  children,
}: {
  params: InboxParams;
  isAdmin: boolean;
  hasSelection: boolean;
  selectedId?: string;
  children: React.ReactNode;
}) {
  const companyId = await getDefaultCompanyId();
  const [settings, counts] = await Promise.all([
    getAssistantSettings(companyId).catch(() => null),
    countAttentionItems(companyId).catch(() => null),
  ]);
  const mode = settings ? effectiveMode(settings) : "OFF";

  return (
    <div className="flex flex-col gap-4 md:h-[calc(100dvh-9.5rem)] lg:h-[calc(100dvh-6.25rem)]">
      <div className={cn("shrink-0 space-y-4", hasSelection && "hidden md:block")}>
        <PageHeader
          title="Conversaciones"
          description="Asistente de WhatsApp: historial, lo que entendió, canalizaciones y pendientes."
          actions={
            <>
              <span
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium",
                  env.assistant.killSwitch || mode === "OFF" ? "bg-ink-100 text-ink-700" : mode === "TEST_ONLY" ? "bg-sky-50 text-sky-800" : "bg-emerald-50 text-emerald-800"
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    env.assistant.killSwitch || mode === "OFF" ? "bg-ink-400" : mode === "TEST_ONLY" ? "bg-sky-500" : "bg-emerald-500"
                  )}
                  aria-hidden
                />
                {env.assistant.killSwitch ? "Asistente apagado (emergencia)" : MODE_LABELS[mode]}
              </span>
              {isAdmin && (
                <>
                  <Link href="/conversaciones/simulador" className={buttonClass("secondary")}>
                    <FlaskConical className="size-4" aria-hidden />
                    Simulador
                  </Link>
                  <Link href="/conversaciones/ajustes" className={buttonClass("secondary", "icon")} title="Configuración del asistente" aria-label="Configuración del asistente">
                    <SlidersHorizontal className="size-4" aria-hidden />
                  </Link>
                </>
              )}
            </>
          }
        />
        {counts && (
          <div className="hidden grid-cols-3 gap-4 md:grid">
            <StatCard
              size="sm"
              label="Pendientes de gerencia / humano"
              value={counts.pendingEscalations}
              icon={MessageSquareWarning}
              tone="warning"
              href={`/conversaciones${inboxQuery({ ...params, tab: "clientes" }, { filter: "attention", page: 1 })}`}
            />
            <StatCard
              size="sm"
              label="Contactos con IA pausada por una persona"
              value={counts.humanControl}
              icon={BotOff}
              tone="success"
              href={`/conversaciones${inboxQuery({ ...params, tab: "clientes" }, { filter: "human", page: 1 })}`}
            />
            <StatCard
              size="sm"
              label="Envíos fallidos o inciertos (7 días)"
              value={counts.deliveryIssues}
              icon={AlertTriangle}
              tone="danger"
              href={`/conversaciones${inboxQuery({ ...params, tab: "clientes" }, { filter: "errors", page: 1 })}`}
            />
          </div>
        )}
      </div>

      <div className={cn("flex min-h-0 flex-1 gap-4", hasSelection ? "h-[calc(100dvh-7.5rem)] md:h-auto" : "")}>
        <section
          aria-label="Lista de conversaciones"
          className={cn(
            "card min-h-[480px] w-full shrink-0 flex-col overflow-hidden md:flex md:min-h-0 md:w-[340px] lg:w-[360px]",
            hasSelection ? "hidden" : "flex"
          )}
        >
          <InboxList params={params} selectedId={selectedId} counts={counts} />
        </section>
        <div className={cn("min-h-0 min-w-0 flex-1", hasSelection ? "flex" : "hidden md:flex")}>{children}</div>
      </div>
      <AutoRefresh />
    </div>
  );
}

export function InboxEmptyChat({ tab }: { tab: InboxTab }) {
  return (
    <div className="card flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent-100 text-accent-700">
        {tab === "asesores" ? <UserSquare2 className="size-8" aria-hidden /> : <MessagesSquare className="size-8" aria-hidden />}
      </div>
      <p className="text-base font-semibold text-ink-950">{tab === "asesores" ? "Elige un asesor" : "Elige una conversación"}</p>
      <p className="max-w-sm text-sm text-ink-500">
        {tab === "asesores"
          ? "Verás los avisos de nuevos leads que recibió y, si escribe al número del bot, sus mensajes."
          : "Selecciona un chat para ver el historial con el cliente, lo que entendió la IA y a qué asesor se canalizó."}
      </p>
    </div>
  );
}

function InboxList({
  params,
  selectedId,
  counts,
}: {
  params: InboxParams;
  selectedId?: string;
  counts: Awaited<ReturnType<typeof countAttentionItems>> | null;
}) {
  const attentionTotal = counts ? counts.pendingEscalations + counts.humanControl : 0;
  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-ink-100 p-4">
        <InboxTabs current={params.tab} />
        <InboxSearch placeholder={params.tab === "asesores" ? "Buscar asesor por nombre o teléfono…" : "Buscar por nombre, teléfono o ID…"} />
        {params.tab === "clientes" && (
          <FolderSelect value={params.filter} options={FILTERS.map((item) => ({ ...item, count: item.value === "attention" ? attentionTotal : undefined }))} />
        )}
      </div>
      <ScrollMemory tab={params.tab} selectedId={selectedId} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {params.tab === "asesores" ? <AdvisorItems params={params} selectedId={selectedId} /> : <ClientItems params={params} selectedId={selectedId} />}
      </ScrollMemory>
    </>
  );
}

function ListMessage({ title, description, error }: { title: string; description?: string; error?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center" role={error ? "alert" : undefined}>
      <p className={cn("text-sm font-medium", error ? "text-rose-700" : "text-ink-700")}>{title}</p>
      {description && <p className={cn("text-xs", error ? "text-rose-600" : "text-ink-500")}>{description}</p>}
    </div>
  );
}

async function ClientItems({ params, selectedId }: { params: InboxParams; selectedId?: string }) {
  let data: Awaited<ReturnType<typeof listConversations>>;
  try {
    data = await listConversations({
      companyId: await getDefaultCompanyId(),
      filter: params.filter,
      search: params.q,
      page: params.page,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    return <ListMessage error title="No se pudieron cargar las conversaciones" description={error instanceof Error ? `${error.message} Recarga la página para reintentar.` : undefined} />;
  }

  if (data.items.length === 0) {
    return (
      <ListMessage
        title={params.q ? "Sin resultados" : "Sin conversaciones en esta carpeta"}
        description={params.q ? "Ningún chat coincide con la búsqueda." : params.filter !== "all" ? "Prueba con la carpeta “Todas”." : undefined}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const query = inboxQuery(params);

  return (
    <>
      <ul>
        {data.items.map((conversation) => {
          const name = conversation.name ?? conversation.phone ?? conversation.manyChatSubscriberId;
          const last = conversation.messages[0];
          const status = conversationStatus(conversation);
          const selected = conversation.id === selectedId;
          const pendingTypes = [...new Set(conversation.escalations.map((e) => e.type))];
          return (
            <li key={conversation.id} data-chat-id={conversation.id}>
              <Link
                href={`/conversaciones/${conversation.id}${query}`}
                aria-current={selected ? "true" : undefined}
                className={cn(
                  "relative flex gap-3 border-b border-ink-100 px-4 py-3 transition-colors duration-150",
                  selected ? "bg-accent-50" : "hover:bg-surface-muted"
                )}
              >
                {selected && <span className="absolute inset-y-0 left-0 w-1 bg-accent-500" aria-hidden />}
                <Avatar name={name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-ink-950">{name}</p>
                    <span className="shrink-0 text-[11px] text-ink-500">{formatListTime(conversation.lastActivityAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-ink-600">
                    {last ? (
                      <>
                        <span className="text-ink-400">{ROLE_PREFIX[last.role] ?? ""}</span>
                        {last.text}
                      </>
                    ) : (
                      "Sin mensajes"
                    )}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {pendingTypes.map((type) => (
                      <span
                        key={type}
                        className={cn(
                          "rounded-md px-1.5 py-px text-[10px] font-semibold",
                          type === "MANAGEMENT" || type === "PROCESSING_ERROR" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"
                        )}
                      >
                        {escalationTypeLabel(type)}
                      </span>
                    ))}
                    {status.key !== "ai" && (
                      <span className={cn("rounded-md px-1.5 py-px text-[10px] font-medium", status.key === "waiting" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800")}>
                        {status.key === "waiting" ? "Esperando tras canalizar" : status.key === "human" ? "Atención humana" : "IA en pausa"}
                      </span>
                    )}
                    {conversation.lead?.assignedAdvisor && (
                      <span className="max-w-[10rem] truncate rounded-md bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                        {conversation.lead.assignedAdvisor.name}
                      </span>
                    )}
                    {conversation.lastError && <span className="rounded-md bg-rose-50 px-1.5 py-px text-[10px] font-medium text-rose-700">Error</span>}
                    {conversation.isTest && <span className="rounded-md bg-ink-100 px-1.5 py-px text-[10px] font-medium text-ink-600">Prueba</span>}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 text-xs">
          {params.page > 1 ? (
            <Link href={`/conversaciones${inboxQuery(params, { page: params.page - 1 })}`} className="font-medium text-accent-700 hover:underline">
              ← Más recientes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-500">
            Página {params.page} de {totalPages}
          </span>
          {params.page < totalPages ? (
            <Link href={`/conversaciones${inboxQuery(params, { page: params.page + 1 })}`} className="font-medium text-accent-700 hover:underline">
              Anteriores →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </>
  );
}

async function AdvisorItems({ params, selectedId }: { params: InboxParams; selectedId?: string }) {
  let threads: Awaited<ReturnType<typeof listAdvisorThreads>>;
  try {
    threads = await listAdvisorThreads({ companyId: await getDefaultCompanyId(), search: params.q });
  } catch (error) {
    return <ListMessage error title="No se pudieron cargar los asesores" description={error instanceof Error ? `${error.message} Recarga la página para reintentar.` : undefined} />;
  }
  if (threads.length === 0) {
    return <ListMessage title={params.q ? "Sin resultados" : "Sin asesores"} description={params.q ? "Ningún asesor coincide con la búsqueda." : "Da de alta asesores en la sección Asesores."} />;
  }

  const query = inboxQuery(params);
  const now = new Date();

  return (
    <ul>
      {threads.map((thread) => {
        const selected = thread.advisor.id === selectedId;
        const paused = Boolean(thread.advisor.pausedUntil && thread.advisor.pausedUntil > now);
        const availability = !thread.advisor.active
          ? { dot: "bg-ink-300", label: "Inactivo: no recibe leads" }
          : paused
            ? { dot: "bg-amber-500", label: "En pausa: no recibe leads" }
            : { dot: "bg-emerald-500", label: "Disponible para recibir leads" };
        return (
          <li key={thread.advisor.id} data-chat-id={thread.advisor.id}>
            <Link
              href={`/conversaciones/asesor/${thread.advisor.id}${query}`}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "relative flex gap-3 border-b border-ink-100 px-4 py-3 transition-colors duration-150",
                selected ? "bg-accent-50" : "hover:bg-surface-muted"
              )}
            >
              {selected && <span className="absolute inset-y-0 left-0 w-1 bg-accent-500" aria-hidden />}
              <div className="relative">
                <Avatar name={thread.advisor.name} className={cn(!thread.advisor.active && "opacity-60")} />
                <span className={cn("absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-surface", availability.dot)} title={availability.label} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={cn("truncate text-sm font-semibold", thread.advisor.active ? "text-ink-950" : "text-ink-500")}>{thread.advisor.name}</p>
                  <span className="shrink-0 text-[11px] text-ink-500">{formatListTime(thread.lastAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-ink-600">
                  {thread.preview ? (
                    thread.preview.kind === "message" ? (
                      <>
                        <span className="text-ink-400">{ROLE_PREFIX[thread.preview.role] ?? ""}</span>
                        {thread.preview.text}
                      </>
                    ) : (
                      <>
                        <span className="text-ink-400">Aviso: </span>
                        {thread.preview.text}
                      </>
                    )
                  ) : (
                    "Sin actividad registrada"
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="sr-only">{availability.label}.</span>
                  <span className="rounded-md bg-ink-100 px-1.5 py-px text-[10px] font-medium text-ink-700">
                    {thread.leadsThisWeek} lead{thread.leadsThisWeek === 1 ? "" : "s"} · últimos 7 días
                  </span>
                  {thread.conversationId && <span className="rounded-md bg-sky-50 px-1.5 py-px text-[10px] font-medium text-sky-700">Escribe al bot</span>}
                  {thread.preview?.kind === "lead" && !thread.preview.notified && (
                    <span className="rounded-md bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800">Aviso sin confirmar</span>
                  )}
                  {!thread.advisor.active && <span className="rounded-md bg-ink-100 px-1.5 py-px text-[10px] font-medium text-ink-500">Inactivo</span>}
                  {paused && thread.advisor.active && <span className="rounded-md bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800">En pausa</span>}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
