import Link from "next/link";
import { AlertTriangle, Bot, FlaskConical, Headset, MessagesSquare, SlidersHorizontal, UserSquare2, Users } from "lucide-react";
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
import { Avatar, formatListTime } from "@/components/conversaciones/conversation-view";
import { AutoRefresh, FolderSelect, InboxSearch } from "@/components/conversaciones/inbox-client";
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
  { value: "errors", label: "Con errores" },
  { value: "test", label: "Pruebas" },
];

const MODE_LABELS = { OFF: "IA apagada", TEST_ONLY: "IA solo pruebas", ON: "IA activa" } as const;

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

const ROLE_PREFIX: Record<string, string> = { ASSISTANT: "IA: ", HUMAN_AGENT: "Equipo: ", SYSTEM: "" };

/**
 * Armazón de la bandeja: lista de chats | chat | (detalles, dentro del chat).
 * En móvil se muestra la lista o el chat, nunca ambos.
 */
export function InboxShell({ list, children, hasSelection }: { list: React.ReactNode; children: React.ReactNode; hasSelection: boolean }) {
  return (
    <div className="flex h-full min-h-0 w-full bg-surface">
      <div
        className={cn(
          "h-full min-h-0 w-full shrink-0 flex-col border-r border-ink-200 md:flex md:w-[340px]",
          hasSelection ? "hidden" : "flex"
        )}
      >
        {list}
      </div>
      <div className={cn("h-full min-h-0 min-w-0 flex-1", hasSelection ? "flex" : "hidden md:flex")}>{children}</div>
      <AutoRefresh />
    </div>
  );
}

export function InboxEmptyChat({ tab }: { tab: InboxTab }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-ink-50 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-surface text-accent-600 shadow-card">
        {tab === "asesores" ? <UserSquare2 className="size-8" aria-hidden /> : <MessagesSquare className="size-8" aria-hidden />}
      </div>
      <p className="text-base font-semibold text-ink-900">{tab === "asesores" ? "Elige un asesor" : "Elige una conversación"}</p>
      <p className="max-w-sm text-sm text-ink-500">
        {tab === "asesores"
          ? "Verás los avisos de leads que recibió por WhatsApp y, si escribe al número del bot, su conversación."
          : "Selecciona un chat de la lista para ver el historial con el cliente, lo que entendió la IA y a qué asesor se canalizó."}
      </p>
    </div>
  );
}

export async function InboxList({
  params,
  selectedId,
  basePath,
  isAdmin,
}: {
  params: InboxParams;
  selectedId?: string;
  basePath: string;
  isAdmin: boolean;
}) {
  const companyId = await getDefaultCompanyId();
  const [settings, counts] = await Promise.all([
    getAssistantSettings(companyId).catch(() => null),
    countAttentionItems(companyId).catch(() => null),
  ]);
  const mode = settings ? effectiveMode(settings) : "OFF";
  const attentionTotal = counts ? counts.pendingEscalations + counts.humanControl : 0;

  return (
    <>
      <div className="shrink-0 space-y-3 border-b border-ink-200 px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-ink-900">Bandeja</h1>
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "mr-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
                mode === "ON" ? "bg-emerald-50 text-emerald-700" : mode === "TEST_ONLY" ? "bg-accent-50 text-accent-700" : "bg-ink-100 text-ink-600"
              )}
              title={env.assistant.killSwitch ? "Apagado por ASSISTANT_DISABLED" : undefined}
            >
              <span
                className={cn("size-1.5 rounded-full", mode === "ON" ? "bg-emerald-500" : mode === "TEST_ONLY" ? "bg-accent-500" : "bg-ink-400")}
              />
              {env.assistant.killSwitch ? "IA apagada (emergencia)" : MODE_LABELS[mode]}
            </span>
            {isAdmin && (
              <>
                <Link
                  href="/conversaciones/simulador"
                  className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                  title="Simulador"
                  aria-label="Simulador"
                >
                  <FlaskConical className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/conversaciones/ajustes"
                  className="flex size-8 items-center justify-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
                  title="Configuración del asistente"
                  aria-label="Configuración del asistente"
                >
                  <SlidersHorizontal className="size-4" aria-hidden />
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-ink-100 p-1" role="tablist">
          {(
            [
              { tab: "clientes", label: "Clientes", icon: Users },
              { tab: "asesores", label: "Asesores", icon: UserSquare2 },
            ] as const
          ).map(({ tab, label, icon: Icon }) => (
            <Link
              key={tab}
              href={`/conversaciones${tab === "asesores" ? "?tab=asesores" : ""}`}
              role="tab"
              aria-selected={params.tab === tab}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors",
                params.tab === tab ? "bg-surface text-ink-900 shadow-sm" : "text-ink-500 hover:text-ink-800"
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ))}
        </div>

        <InboxSearch basePath={basePath} placeholder={params.tab === "asesores" ? "Buscar asesor…" : "Buscar nombre, teléfono o ID…"} />

        {params.tab === "clientes" && (
          <FolderSelect
            basePath={basePath}
            value={params.filter}
            options={FILTERS.map((item) => ({ ...item, count: item.value === "attention" ? attentionTotal : undefined }))}
          />
        )}

        {params.tab === "clientes" && counts && (counts.pendingEscalations > 0 || counts.deliveryIssues > 0) && (
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {counts.pendingEscalations > 0 && (
              <Link
                href={`/conversaciones${inboxQuery(params, { filter: "attention", page: 1 })}`}
                className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
              >
                <AlertTriangle className="size-3" aria-hidden />
                {counts.pendingEscalations} pendiente(s)
              </Link>
            )}
            {counts.deliveryIssues > 0 && (
              <Link
                href={`/conversaciones${inboxQuery(params, { filter: "errors", page: 1 })}`}
                className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-700 hover:bg-rose-100"
              >
                {counts.deliveryIssues} envío(s) con problema · 7 d
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {params.tab === "asesores" ? <AdvisorItems params={params} selectedId={selectedId} /> : <ClientItems params={params} selectedId={selectedId} />}
      </div>
    </>
  );
}

function ListMessage({ title, description, error }: { title: string; description?: string; error?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
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
    return <ListMessage error title="No se pudieron cargar las conversaciones" description={error instanceof Error ? error.message : undefined} />;
  }

  if (data.items.length === 0) {
    return <ListMessage title="Sin conversaciones en esta carpeta" description={params.q ? "Ajusta tu búsqueda." : undefined} />;
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
          const needsAttention = conversation._count.escalations > 0 || Boolean(conversation.lastError) || status.key === "human" || status.key === "paused";
          return (
            <li key={conversation.id}>
              <Link
                href={`/conversaciones/${conversation.id}${query}`}
                className={cn(
                  "relative flex gap-3 border-b border-ink-100 px-4 py-3 transition-colors",
                  selected ? "bg-accent-50" : "hover:bg-ink-50"
                )}
              >
                {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-600" aria-hidden />}
                <div className="relative">
                  <Avatar name={name} />
                  <span
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full ring-2 ring-surface",
                      status.key === "ai" ? "bg-accent-600 text-white" : status.key === "waiting" ? "bg-sky-400 text-white" : "bg-amber-500 text-white"
                    )}
                    title={status.label}
                  >
                    {status.key === "ai" || status.key === "waiting" ? <Bot className="size-2.5" aria-hidden /> : <Headset className="size-2.5" aria-hidden />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={cn("truncate text-sm text-ink-900", needsAttention ? "font-semibold" : "font-medium")}>{name}</p>
                    <span className="shrink-0 text-[11px] text-ink-400">{formatListTime(conversation.lastActivityAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] text-ink-500">
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
                    {conversation.lead?.assignedAdvisor && (
                      <span className="inline-flex max-w-[11rem] items-center gap-1 truncate rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-medium text-emerald-700">
                        <UserSquare2 className="size-2.5 shrink-0" aria-hidden />
                        <span className="truncate">{conversation.lead.assignedAdvisor.name}</span>
                      </span>
                    )}
                    {status.key !== "ai" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-px text-[10px] font-medium",
                          status.key === "waiting" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"
                        )}
                      >
                        {status.key === "waiting" ? "Esperando" : status.key === "human" ? "Humano" : "Pausada"}
                      </span>
                    )}
                    {conversation._count.escalations > 0 && (
                      <span className="rounded-full bg-amber-500 px-1.5 py-px text-[10px] font-semibold text-white">{conversation._count.escalations} pendiente</span>
                    )}
                    {conversation.lastError && <span className="rounded-full bg-rose-50 px-1.5 py-px text-[10px] font-medium text-rose-700">Error</span>}
                    {conversation.isTest && <span className="rounded-full bg-accent-50 px-1.5 py-px text-[10px] font-medium text-accent-700">Prueba</span>}
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
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-400">
            {params.page} / {totalPages}
          </span>
          {params.page < totalPages ? (
            <Link href={`/conversaciones${inboxQuery(params, { page: params.page + 1 })}`} className="font-medium text-accent-700 hover:underline">
              Siguientes →
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
    return <ListMessage error title="No se pudieron cargar los asesores" description={error instanceof Error ? error.message : undefined} />;
  }
  if (threads.length === 0) {
    return <ListMessage title="Sin asesores" description={params.q ? "Ajusta tu búsqueda." : "Da de alta asesores en la sección Asesores."} />;
  }

  const query = inboxQuery(params);
  const now = new Date();

  return (
    <ul>
      {threads.map((thread) => {
        const selected = thread.advisor.id === selectedId;
        const paused = Boolean(thread.advisor.pausedUntil && thread.advisor.pausedUntil > now);
        return (
          <li key={thread.advisor.id}>
            <Link
              href={`/conversaciones/asesor/${thread.advisor.id}${query}`}
              className={cn(
                "relative flex gap-3 border-b border-ink-100 px-4 py-3 transition-colors",
                selected ? "bg-accent-50" : "hover:bg-ink-50",
                !thread.advisor.active && "opacity-60"
              )}
            >
              {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-accent-600" aria-hidden />}
              <div className="relative">
                <Avatar name={thread.advisor.name} />
                <span
                  className={cn(
                    "absolute bottom-0 right-0 size-3 rounded-full ring-2 ring-surface",
                    !thread.advisor.active ? "bg-ink-300" : paused ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  title={!thread.advisor.active ? "Inactivo" : paused ? "En pausa" : "Activo"}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink-900">{thread.advisor.name}</p>
                  <span className="shrink-0 text-[11px] text-ink-400">{formatListTime(thread.lastAt)}</span>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-ink-500">
                  {thread.preview ? (
                    thread.preview.kind === "message" ? (
                      <>
                        <span className="text-ink-400">{thread.preview.role === "USER" ? "" : ROLE_PREFIX[thread.preview.role] ?? ""}</span>
                        {thread.preview.text}
                      </>
                    ) : (
                      <>
                        <span className="text-ink-400">Aviso: </span>
                        {thread.preview.text}
                      </>
                    )
                  ) : (
                    "Sin actividad"
                  )}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-medium text-ink-600">
                    {thread.leadsThisWeek} lead(s) · 7 d
                  </span>
                  {thread.conversationId && (
                    <span className="rounded-full bg-accent-50 px-1.5 py-px text-[10px] font-medium text-accent-700">Escribe al bot</span>
                  )}
                  {thread.preview?.kind === "lead" && !thread.preview.notified && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800">Aviso pendiente</span>
                  )}
                  {!thread.advisor.active && <span className="rounded-full bg-ink-100 px-1.5 py-px text-[10px] font-medium text-ink-500">Inactivo</span>}
                  {paused && thread.advisor.active && (
                    <span className="rounded-full bg-amber-50 px-1.5 py-px text-[10px] font-medium text-amber-800">En pausa</span>
                  )}
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
