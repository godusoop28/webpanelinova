import Link from "next/link";
import {
  AlertCircle,
  Ban,
  Bot,
  Check,
  Clock,
  ExternalLink,
  FlaskConical,
  Headset,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import type { getConversationDetail } from "@/lib/services/conversation-admin.service";
import { HANDOFF_LABELS, conversationStatus } from "@/lib/services/conversation-admin.service";
import { FACT_LABELS, INTENT_LABELS, type ConversationIntentCode, type Facts } from "@/lib/conversation/policy";
import { ASSISTANT_NAME } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requeueMessageAction, resolveEscalationAction } from "@/app/(protected)/conversaciones/actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;
type Message = Detail["messages"][number];

const TIME_ZONE = "America/Mexico_City";

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTime(value: Date | string): string {
  return new Date(value).toLocaleTimeString("es-MX", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" });
}

/** Clave AAAA-MM-DD del día en Ciudad de México. */
function dayKey(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** Hora si es de hoy, "Ayer", o fecha corta: como en la lista de chats de ManyChat. */
export function formatListTime(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return "";
  const key = dayKey(value);
  if (key === dayKey(now)) return formatTime(value);
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return new Date(value).toLocaleDateString("es-MX", { timeZone: TIME_ZONE, day: "2-digit", month: "short" });
}

export function formatDayLabel(value: Date | string, now = new Date()): string {
  const key = dayKey(value);
  if (key === dayKey(now)) return "Hoy";
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return new Date(value).toLocaleDateString("es-MX", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" });
}

const AVATAR_COLORS = [
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const clean = name.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1 ? parts[0][0] + parts[1][0] : clean.slice(0, 2) || "?").toUpperCase();
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function DaySeparator({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium capitalize text-ink-500 shadow-card">{formatDayLabel(date)}</span>
    </div>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "gold" }> = {
  RECEIVED: { label: "Recibido", tone: "neutral" },
  QUEUED: { label: "En cola", tone: "warning" },
  SENDING: { label: "Enviando", tone: "warning" },
  SENT: { label: "Enviado a ManyChat", tone: "success" },
  FAILED: { label: "Falló el envío", tone: "danger" },
  UNCERTAIN: { label: "Envío incierto", tone: "danger" },
  CANCELLED: { label: "Cancelado", tone: "neutral" },
  SIMULATED: { label: "Simulado (no enviado)", tone: "gold" },
};

function StatusIcon({ status }: { status: string }) {
  const label = STATUS_LABELS[status]?.label ?? status;
  const className = "size-3.5";
  switch (status) {
    case "SENT":
      return <Check className={className} aria-label={label} />;
    case "QUEUED":
    case "SENDING":
      return <Clock className={className} aria-label={label} />;
    case "FAILED":
    case "UNCERTAIN":
      return <AlertCircle className={cn(className, "text-rose-500")} aria-label={label} />;
    case "SIMULATED":
      return <FlaskConical className={className} aria-label={label} />;
    case "CANCELLED":
      return <Ban className={className} aria-label={label} />;
    default:
      return null;
  }
}

/** Burbuja de chat. `side` es desde el punto de vista del negocio: los mensajes del contacto van a la izquierda. */
export function ChatBubble({
  message,
  contactName,
  conversationId,
  isSessionStart,
  incomingLabel,
}: {
  message: Pick<Message, "id" | "seq" | "role" | "text" | "status" | "createdAt" | "metadata" | "lastError">;
  contactName: string;
  conversationId: string;
  isSessionStart?: boolean;
  incomingLabel?: string;
}) {
  const metadata = (message.metadata ?? null) as { duringWait?: boolean; waitNotice?: boolean; recordedBy?: string } | null;

  if (message.role === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[80%] rounded-lg bg-ink-100 px-3 py-1.5 text-center text-xs text-ink-600">{message.text}</p>
      </div>
    );
  }

  const inbound = message.role === "USER";
  const isTeam = message.role === "HUMAN_AGENT";
  const failed = message.status === "FAILED" || message.status === "UNCERTAIN";

  return (
    <>
      {isSessionStart && (
        <div className="flex items-center gap-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-400">
          <span className="h-px flex-1 bg-ink-200" />
          Nueva sesión
          <span className="h-px flex-1 bg-ink-200" />
        </div>
      )}
      <div className={cn("group flex items-end gap-2", inbound ? "justify-start" : "justify-end")}>
        {inbound && <Avatar name={contactName} className="size-7 text-[11px]" />}
        <div className={cn("flex max-w-[78%] flex-col", inbound ? "items-start" : "items-end")}>
          <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-medium text-ink-400">
            {inbound ? (
              incomingLabel ?? contactName
            ) : isTeam ? (
              <>
                <Headset className="size-3" aria-hidden />
                Equipo{metadata?.recordedBy ? ` · ${metadata.recordedBy}` : ""}
              </>
            ) : (
              <>
                <Bot className="size-3" aria-hidden />
                {ASSISTANT_NAME}
              </>
            )}
          </span>
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
              inbound && "rounded-bl-md border border-ink-200 bg-surface text-ink-800",
              !inbound && !isTeam && "rounded-br-md bg-accent-600 text-white",
              isTeam && "rounded-br-md bg-ink-800 text-white",
              failed && "ring-2 ring-rose-300"
            )}
            title={`#${message.seq}`}
          >
            <p className="whitespace-pre-wrap break-words">{message.text}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-ink-400">
            <span>{formatTime(message.createdAt)}</span>
            {!inbound && <StatusIcon status={message.status} />}
            {!inbound && message.status !== "SENT" && STATUS_LABELS[message.status] && (
              <span className={cn(failed && "font-medium text-rose-600")}>{STATUS_LABELS[message.status].label}</span>
            )}
            {metadata?.duringWait && <Badge tone="gold">Durante la espera</Badge>}
            {metadata?.waitNotice && <Badge tone="gold">Aviso de espera</Badge>}
          </div>
          {message.lastError && <p className="mt-1 max-w-full px-1 text-[11px] text-rose-600">{message.lastError}</p>}
          {failed && (
            <form
              action={requeueMessageAction.bind(null, message.id, conversationId)}
              className="mt-1.5 flex flex-wrap items-center justify-end gap-2 px-1 text-[11px] text-ink-600"
            >
              {message.status === "UNCERTAIN" && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="confirmUncertain" required /> Confirmo que no le llegó
                </label>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-full border border-ink-200 bg-surface px-2.5 py-1 font-medium text-ink-700 hover:bg-ink-50"
              >
                <RotateCcw className="size-3" aria-hidden />
                Reintentar envío
              </button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}

export function MessageTimeline({ conversation }: { conversation: Detail }) {
  const contactName = conversation.name ?? conversation.phone ?? "Contacto";
  return (
    <div className="space-y-3">
      {conversation.messages.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-500">
          <MessageCircle className="size-8 text-ink-300" aria-hidden />
          Aún no hay mensajes en esta conversación.
        </div>
      )}
      {conversation.messages.map((message, index, all) => {
        const showDay = index === 0 || dayKey(all[index - 1].createdAt) !== dayKey(message.createdAt);
        return (
          <div key={message.id} className="space-y-3">
            {showDay && <DaySeparator date={message.createdAt} />}
            <ChatBubble
              message={message}
              contactName={contactName}
              conversationId={conversation.id}
              isSessionStart={message.seq === conversation.sessionStartSeq && conversation.sessionCount > 1}
            />
          </div>
        );
      })}
      {conversation.processedSeq < conversation.lastSeq && (
        <p className="mx-auto w-fit rounded-full bg-amber-50 px-3 py-1 text-center text-xs text-amber-800">
          {conversation.control === "AI"
            ? `Mensajes pendientes de interpretar (se procesan tras ${formatDateTime(conversation.processAfter)}).`
            : "Mensajes recibidos mientras la IA está detenida: nadie los ha contestado automáticamente."}
        </p>
      )}
    </div>
  );
}

/** Sección del panel lateral de detalles (estilo "Contact info" de ManyChat). */
export function DetailSection({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-2.5 border-b border-ink-100 px-5 py-4 last:border-0", className)}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</h3>
      {children}
    </section>
  );
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink-800">{children}</dd>
    </div>
  );
}

export function ConversationStatePanel({ conversation, bare = false }: { conversation: Detail; bare?: boolean }) {
  const facts = (conversation.facts ?? {}) as Facts;
  const properties = Array.isArray(conversation.properties) ? (conversation.properties as { publicId: string; title: string; url?: string | null }[]) : [];
  const lead = conversation.lead;
  const assignment = lead?.assignments[0];
  const status = conversationStatus(conversation);

  const content = (
    <>
      <DetailSection title="Estado">
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge
            tone={
              conversation.handoffState === "ASSIGNED" || conversation.handoffState === "EXISTING_LEAD"
                ? "success"
                : conversation.handoffState === "FAILED" || conversation.handoffState === "NO_ADVISOR"
                  ? "danger"
                  : "neutral"
            }
          >
            {HANDOFF_LABELS[conversation.handoffState]}
          </Badge>
          {conversation.isTest && <Badge tone="gold">Prueba</Badge>}
        </div>
        {conversation.controlReason && <p className="text-xs text-ink-500">{conversation.controlReason}</p>}
        {conversation.handoffReason && <p className="text-xs text-ink-600">Canalización: {conversation.handoffReason}</p>}
        {conversation.lastError && <p className="rounded-lg bg-rose-50 p-2 text-xs text-rose-700">Último error: {conversation.lastError}</p>}
      </DetailSection>

      <DetailSection title="Contacto">
        <dl className="space-y-1.5">
          <DetailRow label="Teléfono">{conversation.phone ?? "—"}</DetailRow>
          <DetailRow label="ManyChat ID">{conversation.manyChatSubscriberId}</DetailRow>
          <DetailRow label="Campaña / origen">{conversation.campaignRef ?? "—"}</DetailRow>
          <DetailRow label="Última actividad">{formatDateTime(conversation.lastActivityAt)}</DetailRow>
          <DetailRow label="Sesión actual">
            #{conversation.sessionCount} · {formatDateTime(conversation.sessionStartedAt ?? conversation.createdAt)}
          </DetailRow>
          <DetailRow label="Espera tras canalizar">
            {conversation.reopenAt ? `${conversation.reopenAt > new Date() ? "hasta" : "venció"} ${formatDateTime(conversation.reopenAt)}` : "—"}
          </DetailRow>
          <DetailRow label="Asesor comunicado">{conversation.assignmentNoticeAt ? formatDateTime(conversation.assignmentNoticeAt) : "—"}</DetailRow>
        </dl>
      </DetailSection>

      <DetailSection title="Asesor y lead">
        {lead ? (
          <div className="space-y-2">
            {lead.assignedAdvisor ? (
              <Link
                href={`/conversaciones/asesor/${lead.assignedAdvisor.id}`}
                className="flex items-center gap-2.5 rounded-lg border border-ink-200 p-2 transition-colors hover:bg-ink-50"
              >
                <Avatar name={lead.assignedAdvisor.name} className="size-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{lead.assignedAdvisor.name}</p>
                  <p className="text-[11px] text-accent-700">Ver chat con el asesor</p>
                </div>
              </Link>
            ) : (
              <p className="text-xs text-ink-500">Sin asesor asignado.</p>
            )}
            <dl className="space-y-1.5">
              <DetailRow label="Ruta">{lead.route ?? "—"}</DetailRow>
              <DetailRow label="Origen">{lead.origin ?? "—"}</DetailRow>
              <DetailRow label="EasyBroker">{assignment?.easyBrokerConfirmed ? "Confirmado" : "Pendiente"}</DetailRow>
              <DetailRow label="Aviso al asesor">{assignment?.manyChatNotified ? "Enviado" : "Pendiente"}</DetailRow>
            </dl>
            <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
              Ver lead <ExternalLink className="size-3" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-xs text-ink-500">Sin lead vinculado.</p>
        )}
      </DetailSection>

      <DetailSection title="Lo que entendió el asistente">
        <p className="text-xs text-ink-700">
          <span className="text-ink-500">Intención: </span>
          <span className="font-medium">{INTENT_LABELS[conversation.primaryIntent as ConversationIntentCode]}</span>
          {conversation.secondaryIntents.length > 0 && (
            <span className="text-ink-500"> · también: {conversation.secondaryIntents.map((i) => INTENT_LABELS[i as ConversationIntentCode]).join(", ")}</span>
          )}
        </p>
        {Object.keys(facts).length > 0 && (
          <dl className="space-y-1.5">
            {Object.entries(facts).map(([key, fact]) => (
              <DetailRow key={key} label={FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key}>
                {fact?.status === "declined" ? <em className="font-normal text-ink-500">prefirió no decirlo</em> : fact?.value}
              </DetailRow>
            ))}
          </dl>
        )}
        {conversation.missingData.length > 0 && (
          <p className="text-xs text-ink-500">
            Falta (orientativo): {conversation.missingData.map((key) => FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key).join(", ")}
          </p>
        )}
        {properties.length > 0 && (
          <ul className="space-y-1.5">
            {properties.map((property) => (
              <li key={property.publicId} className="flex items-center gap-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs">
                <span className="font-semibold text-ink-800">{property.publicId}</span>
                <span className="min-w-0 flex-1 truncate text-ink-600">{property.title}</span>
                {property.url && (
                  <a href={property.url} target="_blank" rel="noreferrer" className="text-accent-700 hover:underline" aria-label="Ver propiedad">
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        {conversation.summary && <p className="rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-700">{conversation.summary}</p>}
      </DetailSection>

      {conversation.escalations.length > 0 && (
        <DetailSection title="Pendientes">
          <div className="space-y-2">
            {conversation.escalations.map((escalation) => (
              <div key={escalation.id} className="rounded-lg border border-ink-200 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={escalation.status === "RESOLVED" ? "neutral" : "warning"}>{escalation.type}</Badge>
                  <span className="text-ink-500">
                    {escalation.status === "NOTIFIED" ? "avisado" : escalation.status === "RESOLVED" ? "resuelto" : "pendiente (sin aviso)"}
                  </span>
                </div>
                <p className="mt-1.5 text-ink-700">{escalation.reason}</p>
                <p className="mt-1 text-[11px] text-ink-400">{formatDateTime(escalation.createdAt)}</p>
                {escalation.status !== "RESOLVED" && (
                  <form action={resolveEscalationAction.bind(null, escalation.id, conversation.id)} className="mt-2 flex gap-2">
                    <input
                      name="notes"
                      placeholder="Nota (opcional)"
                      className="min-w-0 flex-1 rounded-md border border-ink-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent-400"
                    />
                    <button type="submit" className="rounded-md bg-accent-600 px-2.5 py-1 font-medium text-white hover:bg-accent-700">
                      Resolver
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </DetailSection>
      )}
    </>
  );

  if (bare) return content;
  return <Card className="overflow-hidden">{content}</Card>;
}

export function TurnTrace({ conversation, bare = false }: { conversation: Detail; bare?: boolean }) {
  if (conversation.turns.length === 0) return null;
  const list = (
    <div className="space-y-2 text-xs">
      {conversation.turns.map((turn) => {
        const trace = (turn.toolCalls ?? {}) as { tools?: { name: string; ok: boolean; note: string }[]; corrections?: number };
        return (
          <div key={turn.id} className="rounded-lg border border-ink-200 p-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={turn.status === "COMPLETED" ? "success" : turn.status === "FAILED" ? "danger" : "neutral"}>{turn.status}</Badge>
              <span>
                #{turn.fromSeq}–#{turn.toSeq}
              </span>
              <span className="text-ink-500">{formatDateTime(turn.createdAt)}</span>
              {turn.durationMs != null && <span className="text-ink-500">{(turn.durationMs / 1000).toFixed(1)} s</span>}
              {turn.inputTokens != null && (
                <span className="text-ink-500">
                  tokens {turn.inputTokens}/{turn.outputTokens}
                </span>
              )}
              {trace.corrections ? <span className="text-amber-700">correcciones: {trace.corrections}</span> : null}
            </div>
            {trace.tools && trace.tools.length > 0 && (
              <p className="mt-1 text-ink-600">{trace.tools.map((tool) => `${tool.ok ? "✓" : "✗"} ${tool.name} (${tool.note})`).join(" · ")}</p>
            )}
            {turn.error && <p className="mt-1 text-rose-600">{turn.error}</p>}
          </div>
        );
      })}
    </div>
  );

  if (bare) {
    return (
      <DetailSection title="Traza de procesamiento">
        <details className="group">
          <summary className="cursor-pointer select-none text-xs font-medium text-accent-700 hover:underline">
            Ver {conversation.turns.length} turno(s) — herramientas y consumo
          </summary>
          <div className="mt-2">{list}</div>
        </details>
      </DetailSection>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Traza de procesamiento</CardTitle>
          <CardDescription>Herramientas usadas y consumo por turno (sin razonamiento interno del modelo).</CardDescription>
        </div>
      </CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  );
}
