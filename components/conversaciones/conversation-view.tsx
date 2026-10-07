import Link from "next/link";
import {
  AlertCircle,
  Ban,
  Bell,
  Bot,
  Building2,
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
import { escalationStatus, escalationTypeLabel } from "@/lib/conversation/escalation-labels";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requeueMessageAction, resolveEscalationAction } from "@/app/(protected)/conversaciones/actions";

export { Avatar };

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
export function dayKey(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

/** Hora si es de hoy, "Ayer", o fecha corta. */
export function formatListTime(value: Date | string | null | undefined, now = new Date()): string {
  if (!value) return "";
  const key = dayKey(value);
  if (key === dayKey(now)) return formatTime(value);
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return "Ayer";
  return new Date(value).toLocaleDateString("es-MX", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
}

export function formatDayLabel(value: Date | string, now = new Date()): string {
  const key = dayKey(value);
  const full = new Date(value).toLocaleDateString("es-MX", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (key === dayKey(now)) return `Hoy, ${full}`;
  if (key === dayKey(new Date(now.getTime() - 86_400_000))) return `Ayer, ${full}`;
  return full;
}

export function DaySeparator({ date }: { date: Date | string }) {
  return (
    <div className="flex items-center gap-3 py-2" role="separator">
      <span className="h-px flex-1 bg-ink-200" />
      <span className="text-[11px] font-medium first-letter:uppercase text-ink-500">{formatDayLabel(date)}</span>
      <span className="h-px flex-1 bg-ink-200" />
    </div>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/g;

/** Texto con enlaces clicables (el sistema solo guarda texto; no hay adjuntos). */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noreferrer noopener" className="break-all font-medium underline decoration-1 underline-offset-2">
            {part}
          </a>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
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
      return <Check className={cn(className, "text-emerald-600")} aria-label={label} />;
    case "QUEUED":
    case "SENDING":
      return <Clock className={className} aria-label={label} />;
    case "FAILED":
    case "UNCERTAIN":
      return <AlertCircle className={cn(className, "text-rose-600")} aria-label={label} />;
    case "SIMULATED":
      return <FlaskConical className={className} aria-label={label} />;
    case "CANCELLED":
      return <Ban className={className} aria-label={label} />;
    default:
      return null;
  }
}

/** Burbuja de chat. Los mensajes del contacto (cliente o asesor) van a la izquierda; los del bot y del equipo, a la derecha. */
export function ChatBubble({
  message,
  contactName,
  conversationId,
  isSessionStart,
}: {
  message: Pick<Message, "id" | "seq" | "role" | "text" | "status" | "createdAt" | "metadata" | "lastError">;
  contactName: string;
  conversationId: string;
  isSessionStart?: boolean;
}) {
  const metadata = (message.metadata ?? null) as { duringWait?: boolean; waitNotice?: boolean; recordedBy?: string } | null;

  if (message.role === "SYSTEM") {
    return (
      <div className="flex justify-center">
        <p className="max-w-[85%] rounded-lg bg-ink-100 px-3 py-1.5 text-center text-xs text-ink-600">
          <span className="font-medium">Sistema: </span>
          <Linkified text={message.text} />
        </p>
      </div>
    );
  }

  const inbound = message.role === "USER";
  const isTeam = message.role === "HUMAN_AGENT";
  const failed = message.status === "FAILED" || message.status === "UNCERTAIN";
  const sender = inbound ? contactName : isTeam ? `Persona del equipo${metadata?.recordedBy ? ` (${metadata.recordedBy})` : ""}` : "IA";

  return (
    <>
      {isSessionStart && (
        <div className="flex items-center gap-3 py-1 text-[11px] font-medium uppercase tracking-wide text-ink-400" role="separator">
          <span className="h-px flex-1 bg-ink-200" />
          Nueva sesión
          <span className="h-px flex-1 bg-ink-200" />
        </div>
      )}
      <div className={cn("flex items-end gap-2", inbound ? "justify-start" : "justify-end")}>
        {inbound && <Avatar name={contactName} className="size-8 text-[11px]" />}
        <div className={cn("flex max-w-[80%] flex-col sm:max-w-[72%]", inbound ? "items-start" : "items-end")}>
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
              inbound && "rounded-bl-md bg-ink-100 text-ink-900",
              !inbound && !isTeam && "rounded-br-md border border-emerald-100 bg-emerald-50 text-ink-900",
              isTeam && "rounded-br-md border border-accent-200 bg-accent-50 text-ink-900",
              failed && "ring-2 ring-rose-300"
            )}
            title={`Mensaje #${message.seq}`}
          >
            <span className="sr-only">{sender}: </span>
            <p className="whitespace-pre-wrap break-words">
              <Linkified text={message.text} />
            </p>
            <p className="mt-1 text-right text-[11px] text-ink-500">{formatTime(message.createdAt)}</p>
          </div>
          {!inbound && (
            <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5 px-1 text-[11px] text-ink-500">
              <StatusIcon status={message.status} />
              <span className={cn(failed && "font-medium text-rose-700")}>
                {isTeam ? "Registrado por el equipo" : "Enviado por IA"}
                {message.status !== "SENT" && STATUS_LABELS[message.status] ? ` · ${STATUS_LABELS[message.status].label}` : ""}
              </span>
              {metadata?.duringWait && <Badge tone="gold">Durante la espera</Badge>}
              {metadata?.waitNotice && <Badge tone="gold">Aviso de espera</Badge>}
            </div>
          )}
          {message.lastError && <p className="mt-1 max-w-full px-1 text-[11px] text-rose-700">{message.lastError}</p>}
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
        {!inbound && (
          <div
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              isTeam ? "bg-accent-100 text-accent-800" : "bg-emerald-100 text-emerald-800"
            )}
            aria-hidden
          >
            {isTeam ? <Headset className="size-3.5" /> : "IA"}
          </div>
        )}
      </div>
    </>
  );
}

export function MessageTimeline({ conversation }: { conversation: Detail }) {
  const contactName = conversation.name ?? conversation.phone ?? "Contacto";
  return (
    <div className="space-y-4">
      {conversation.messages.length >= 500 && (
        <p className="text-center text-xs text-ink-500">Se muestran los primeros 500 mensajes de la conversación.</p>
      )}
      {conversation.messages.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-500">
          <MessageCircle className="size-8 text-ink-300" aria-hidden />
          Aún no hay mensajes en esta conversación.
        </div>
      )}
      {conversation.messages.map((message, index, all) => {
        const showDay = index === 0 || dayKey(all[index - 1].createdAt) !== dayKey(message.createdAt);
        return (
          <div key={message.id} className="space-y-4">
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

/** Sección del panel de contexto. */
export function DetailSection({ title, children, className, icon: Icon }: { title: string; children: React.ReactNode; className?: string; icon?: typeof Bell }) {
  return (
    <section className={cn("space-y-3 border-b border-ink-100 px-5 py-4 last:border-0", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-950">
        {Icon && <Icon className="size-4 text-ink-500" aria-hidden />}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 text-[13px]">
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-ink-900">{children}</dd>
    </div>
  );
}

function handoffTone(state: string): "success" | "danger" | "neutral" | "info" {
  if (state === "ASSIGNED" || state === "EXISTING_LEAD") return "success";
  if (state === "FAILED" || state === "NO_ADVISOR") return "danger";
  if (state === "NOT_APPLICABLE") return "info";
  return "neutral";
}

/** Pendientes de la conversación, con la diferencia real entre "sin aviso enviado" y "aviso enviado". */
export function EscalationList({ conversation }: { conversation: Detail }) {
  if (conversation.escalations.length === 0) return null;
  return (
    <DetailSection title="Pendientes" icon={Bell}>
      <div className="space-y-2.5">
        {conversation.escalations.map((escalation) => {
          const status = escalationStatus(escalation.status);
          return (
            <div
              key={escalation.id}
              className={cn(
                "rounded-xl border p-3 text-xs",
                escalation.status === "RESOLVED" ? "border-ink-200 bg-surface" : escalation.status === "PENDING" ? "border-amber-200 bg-amber-50/60" : "border-sky-200 bg-sky-50/50"
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={escalation.type === "MANAGEMENT" ? "danger" : escalation.type === "PROCESSING_ERROR" ? "danger" : "warning"}>
                  {escalationTypeLabel(escalation.type)}
                </Badge>
                <Badge tone={status.tone} dot>
                  {status.label}
                </Badge>
              </div>
              <p className="mt-2 text-[13px] text-ink-800">{escalation.reason}</p>
              <p className="mt-1 text-[11px] text-ink-500">
                {status.detail} Creado {formatDateTime(escalation.createdAt)}
                {escalation.notifiedAt ? ` · avisado ${formatDateTime(escalation.notifiedAt)}` : ""}
                {escalation.resolvedAt ? ` · resuelto ${formatDateTime(escalation.resolvedAt)}${escalation.resolvedBy ? ` por ${escalation.resolvedBy}` : ""}` : ""}
              </p>
              {escalation.notes && <p className="mt-1 text-[11px] text-ink-600">Nota: {escalation.notes}</p>}
              {escalation.status !== "RESOLVED" && (
                <form action={resolveEscalationAction.bind(null, escalation.id, conversation.id)} className="mt-2.5 flex gap-2">
                  <label className="sr-only" htmlFor={`note-${escalation.id}`}>
                    Nota de resolución
                  </label>
                  <input
                    id={`note-${escalation.id}`}
                    name="notes"
                    placeholder="Nota (opcional)"
                    className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-surface px-2.5 py-1.5 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-200"
                  />
                  <button type="submit" className="rounded-lg bg-accent-500 px-3 py-1.5 font-medium text-ink-950 hover:bg-accent-400">
                    Marcar resuelto
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </DetailSection>
  );
}

export function ConversationStatePanel({ conversation, bare = false, controls }: { conversation: Detail; bare?: boolean; controls?: React.ReactNode }) {
  const facts = (conversation.facts ?? {}) as Facts;
  const properties = Array.isArray(conversation.properties)
    ? (conversation.properties as { publicId: string; title: string; url?: string | null; verified?: boolean }[])
    : [];
  const lead = conversation.lead;
  const assignment = lead?.assignments[0];
  const status = conversationStatus(conversation);

  const content = (
    <>
      <DetailSection title="Resumen de atención">
        <dl className="space-y-2.5">
          <DetailRow label="Contacto">
            {conversation.name ?? "Sin nombre"}
            <span className="block font-normal text-ink-500">{conversation.phone ?? "Sin teléfono"}</span>
          </DetailRow>
          <DetailRow label="Canal">
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="size-3.5 text-emerald-600" aria-hidden />
              WhatsApp
            </span>
          </DetailRow>
          <DetailRow label="Interés">
            {INTENT_LABELS[conversation.primaryIntent as ConversationIntentCode]}
            {conversation.secondaryIntents.length > 0 && (
              <span className="block font-normal text-ink-500">
                También: {conversation.secondaryIntents.map((i) => INTENT_LABELS[i as ConversationIntentCode]).join(", ")}
              </span>
            )}
          </DetailRow>
          <DetailRow label="Propiedad">
            {properties.length === 0 ? (
              <span className="font-normal text-ink-500">Sin identificar</span>
            ) : (
              <ul className="space-y-1.5">
                {properties.map((property) => (
                  <li key={property.publicId} className="flex items-start gap-1.5">
                    <Building2 className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
                    <span className="min-w-0">
                      <Link href={`/propiedades/${property.publicId}`} className="hover:text-accent-700 hover:underline">
                        {property.publicId}
                      </Link>
                      {property.title && <span className="block font-normal text-ink-500">{property.title}</span>}
                    </span>
                    {property.url && (
                      <a href={property.url} target="_blank" rel="noreferrer" className="ml-auto text-accent-700" aria-label={`Abrir ${property.publicId} en su portal`}>
                        <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </DetailRow>
          <DetailRow label="Asesor asignado">
            {lead?.assignedAdvisor ? (
              <Link href={`/conversaciones/asesor/${lead.assignedAdvisor.id}?tab=asesores`} className="text-accent-700 hover:underline">
                {lead.assignedAdvisor.name}
              </Link>
            ) : (
              <span className="font-normal text-ink-500">Sin asignar</span>
            )}
          </DetailRow>
          <DetailRow label="Canalización">
            <Badge tone={handoffTone(conversation.handoffState)}>{HANDOFF_LABELS[conversation.handoffState]}</Badge>
          </DetailRow>
          <DetailRow label="Estado de la IA">
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          </DetailRow>
          <DetailRow label="Última actividad">{formatDateTime(conversation.lastActivityAt)}</DetailRow>
        </dl>
        {conversation.controlReason && <p className="rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-600">{conversation.controlReason}</p>}
        {conversation.handoffReason && <p className="text-xs text-ink-600">Canalización: {conversation.handoffReason}</p>}
        {conversation.lastError && <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">Último error: {conversation.lastError}</p>}
        {controls}
      </DetailSection>

      <EscalationList conversation={conversation} />

      <DetailSection title="Lead">
        {lead ? (
          <div className="space-y-2.5">
            <dl className="space-y-2">
              <DetailRow label="Ruta">{lead.route ?? "—"}</DetailRow>
              <DetailRow label="Origen">{lead.origin ?? "—"}</DetailRow>
              <DetailRow label="EasyBroker">{assignment ? (assignment.easyBrokerConfirmed ? "Confirmado" : "Pendiente") : "No aplica"}</DetailRow>
              <DetailRow label="Aviso al asesor">{assignment ? (assignment.manyChatNotified ? "Enviado" : "Sin confirmar") : "No aplica"}</DetailRow>
              <DetailRow label="Asesor comunicado">
                {conversation.assignmentNoticeAt ? formatDateTime(conversation.assignmentNoticeAt) : <span className="font-normal text-ink-500">Aún no</span>}
              </DetailRow>
            </dl>
            <Link href={`/leads/${lead.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent-700 hover:underline">
              Ver lead y acciones <ExternalLink className="size-3" aria-hidden />
            </Link>
          </div>
        ) : (
          <p className="text-xs text-ink-500">Sin lead vinculado.</p>
        )}
      </DetailSection>

      <DetailSection title="Lo que entendió el asistente" icon={Bot}>
        {Object.keys(facts).length > 0 ? (
          <dl className="space-y-2">
            {Object.entries(facts).map(([key, fact]) => (
              <DetailRow key={key} label={FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key}>
                {fact?.status === "declined" ? <em className="font-normal text-ink-500">prefirió no decirlo</em> : fact?.value}
              </DetailRow>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-ink-500">Sin datos registrados todavía.</p>
        )}
        {conversation.missingData.length > 0 && (
          <p className="text-xs text-ink-500">
            Falta (orientativo): {conversation.missingData.map((key) => FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key).join(", ")}
          </p>
        )}
        {conversation.summary && <p className="rounded-lg bg-ink-50 p-2.5 text-xs leading-relaxed text-ink-700">{conversation.summary}</p>}
      </DetailSection>

      <DetailSection title="Datos técnicos">
        <dl className="space-y-2">
          <DetailRow label="ManyChat ID">{conversation.manyChatSubscriberId}</DetailRow>
          <DetailRow label="Campaña / origen">{conversation.campaignRef ?? "—"}</DetailRow>
          <DetailRow label="Sesión actual">
            #{conversation.sessionCount} · {formatDateTime(conversation.sessionStartedAt ?? conversation.createdAt)}
          </DetailRow>
          <DetailRow label="Espera tras canalizar">
            {conversation.reopenAt ? `${conversation.reopenAt > new Date() ? "hasta" : "venció"} ${formatDateTime(conversation.reopenAt)}` : "—"}
          </DetailRow>
        </dl>
      </DetailSection>
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
        <details>
          <summary className="cursor-pointer select-none text-xs font-medium text-accent-700 hover:underline">
            Ver {conversation.turns.length} turno(s): herramientas y consumo
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
