import Link from "next/link";
import type { getConversationDetail } from "@/lib/services/conversation-admin.service";
import { CONTROL_LABELS, HANDOFF_LABELS } from "@/lib/services/conversation-admin.service";
import { FACT_LABELS, INTENT_LABELS, type ConversationIntentCode, type Facts } from "@/lib/conversation/policy";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requeueMessageAction, resolveEscalationAction } from "@/app/(protected)/conversaciones/actions";

type Detail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

export function MessageTimeline({ conversation }: { conversation: Detail }) {
  return (
    <div className="space-y-3">
      {conversation.messages.map((message) => {
        const inbound = message.role === "USER";
        const status = STATUS_LABELS[message.status];
        return (
          <div key={message.id} className={cn("flex", inbound ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm shadow-card",
                inbound ? "bg-surface text-ink-800" : message.role === "HUMAN_AGENT" ? "bg-gold-100 text-ink-900" : "bg-ink-900 text-white"
              )}
            >
              <p className="whitespace-pre-wrap break-words">{message.text}</p>
              <div className={cn("mt-1.5 flex flex-wrap items-center gap-2 text-[11px]", inbound ? "text-ink-500" : "text-ink-300")}>
                <span>#{message.seq}</span>
                <span>{message.role === "USER" ? "Cliente" : message.role === "HUMAN_AGENT" ? "Persona del equipo" : "Asistente"}</span>
                <span>{formatDateTime(message.createdAt)}</span>
                {!inbound && status && <Badge tone={status.tone}>{status.label}</Badge>}
              </div>
              {message.lastError && <p className="mt-1 text-[11px] text-rose-300">{message.lastError}</p>}
              {(message.status === "FAILED" || message.status === "UNCERTAIN") && (
                <form action={requeueMessageAction.bind(null, message.id, conversation.id)} className="mt-2 flex items-center gap-2 text-[11px]">
                  {message.status === "UNCERTAIN" && (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" name="confirmUncertain" required /> Confirmo que no le llegó
                    </label>
                  )}
                  <button type="submit" className="rounded bg-white/15 px-2 py-0.5 hover:bg-white/25">
                    Reintentar envío
                  </button>
                </form>
              )}
            </div>
          </div>
        );
      })}
      {conversation.processedSeq < conversation.lastSeq && (
        <p className="text-center text-xs text-ink-500">
          {conversation.control === "AI"
            ? `Mensajes pendientes de interpretar (se procesan tras ${formatDateTime(conversation.processAfter)}).`
            : "Mensajes recibidos mientras la IA está detenida: nadie los ha contestado automáticamente."}
        </p>
      )}
    </div>
  );
}

export function ConversationStatePanel({ conversation }: { conversation: Detail }) {
  const facts = (conversation.facts ?? {}) as Facts;
  const properties = Array.isArray(conversation.properties) ? (conversation.properties as { publicId: string; title: string; url?: string | null }[]) : [];
  const lead = conversation.lead;
  const assignment = lead?.assignments[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Estado</CardTitle>
            <CardDescription>Control de la conversación y canalización son independientes.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge tone={conversation.control === "AI" ? "success" : "warning"}>{CONTROL_LABELS[conversation.control]}</Badge>
            <Badge tone={conversation.handoffState === "ASSIGNED" || conversation.handoffState === "EXISTING_LEAD" ? "success" : conversation.handoffState === "FAILED" || conversation.handoffState === "NO_ADVISOR" ? "danger" : "neutral"}>
              {HANDOFF_LABELS[conversation.handoffState]}
            </Badge>
            {conversation.isTest && <Badge tone="gold">Prueba</Badge>}
          </div>
          {conversation.controlReason && <p className="text-xs text-ink-500">{conversation.controlReason}</p>}
          {conversation.handoffReason && <p className="text-xs text-ink-600">Canalización: {conversation.handoffReason}</p>}
          {conversation.lastError && <p className="text-xs text-rose-600">Último error: {conversation.lastError}</p>}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-ink-500">Teléfono</dt>
            <dd className="text-ink-800">{conversation.phone ?? "—"}</dd>
            <dt className="text-ink-500">ManyChat ID</dt>
            <dd className="text-ink-800">{conversation.manyChatSubscriberId}</dd>
            <dt className="text-ink-500">Campaña / origen</dt>
            <dd className="text-ink-800">{conversation.campaignRef ?? "—"}</dd>
            <dt className="text-ink-500">Última actividad</dt>
            <dd className="text-ink-800">{formatDateTime(conversation.lastActivityAt)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lo que entendió el asistente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-ink-500">Intención: </span>
            {INTENT_LABELS[conversation.primaryIntent as ConversationIntentCode]}
            {conversation.secondaryIntents.length > 0 && (
              <span className="text-ink-500"> · también: {conversation.secondaryIntents.map((i) => INTENT_LABELS[i as ConversationIntentCode]).join(", ")}</span>
            )}
          </p>
          {Object.keys(facts).length > 0 && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {Object.entries(facts).map(([key, fact]) => (
                <div key={key} className="contents">
                  <dt className="text-ink-500">{FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key}</dt>
                  <dd className="text-ink-800">{fact?.status === "declined" ? <em>prefirió no decirlo</em> : fact?.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {conversation.missingData.length > 0 && (
            <p className="text-xs text-ink-500">
              Falta (orientativo): {conversation.missingData.map((key) => FACT_LABELS[key as keyof typeof FACT_LABELS] ?? key).join(", ")}
            </p>
          )}
          {properties.length > 0 && (
            <ul className="space-y-1 text-xs">
              {properties.map((property) => (
                <li key={property.publicId}>
                  <span className="font-medium">{property.publicId}</span> {property.title}{" "}
                  {property.url && (
                    <a href={property.url} target="_blank" rel="noreferrer" className="text-gold-700 hover:underline">
                      ver
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          {conversation.summary && <p className="rounded-lg bg-surface-muted p-2 text-xs text-ink-700">{conversation.summary}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lead y asesor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs">
          {lead ? (
            <>
              <p>
                <Link href={`/leads/${lead.id}`} className="font-medium text-gold-700 hover:underline">
                  Ver lead
                </Link>{" "}
                · {lead.route ?? "—"} · {lead.origin ?? "—"}
              </p>
              <p>Asesor: {lead.assignedAdvisor?.name ?? "Sin asignar"}</p>
              <p>
                Asignación local: {assignment ? "registrada" : "no"} · EasyBroker: {assignment?.easyBrokerConfirmed ? "confirmado" : "pendiente"} · Aviso al asesor:{" "}
                {assignment?.manyChatNotified ? "enviado" : "pendiente"}
              </p>
            </>
          ) : (
            <p className="text-ink-500">Sin lead vinculado.</p>
          )}
        </CardContent>
      </Card>

      {conversation.escalations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pendientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {conversation.escalations.map((escalation) => (
              <div key={escalation.id} className="rounded-lg border border-ink-100 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge tone={escalation.status === "RESOLVED" ? "neutral" : "warning"}>{escalation.type}</Badge>
                  <span className="text-ink-500">{escalation.status === "NOTIFIED" ? "avisado" : escalation.status === "RESOLVED" ? "resuelto" : "pendiente (sin aviso)"}</span>
                  <span className="text-ink-400">{formatDateTime(escalation.createdAt)}</span>
                </div>
                <p className="mt-1 text-ink-700">{escalation.reason}</p>
                {escalation.status !== "RESOLVED" && (
                  <form action={resolveEscalationAction.bind(null, escalation.id, conversation.id)} className="mt-2 flex gap-2">
                    <input name="notes" placeholder="Nota (opcional)" className="flex-1 rounded border border-ink-200 px-2 py-1" />
                    <button type="submit" className="rounded bg-ink-900 px-2 py-1 text-white hover:bg-ink-800">
                      Resolver
                    </button>
                  </form>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function TurnTrace({ conversation }: { conversation: Detail }) {
  if (conversation.turns.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Traza de procesamiento</CardTitle>
          <CardDescription>Herramientas usadas y consumo por turno (sin razonamiento interno del modelo).</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {conversation.turns.map((turn) => {
          const trace = (turn.toolCalls ?? {}) as { tools?: { name: string; ok: boolean; note: string }[]; corrections?: number };
          return (
            <div key={turn.id} className="rounded-lg border border-ink-100 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={turn.status === "COMPLETED" ? "success" : turn.status === "FAILED" ? "danger" : "neutral"}>{turn.status}</Badge>
                <span>
                  mensajes #{turn.fromSeq}–#{turn.toSeq}
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
                <p className="mt-1 text-ink-600">
                  {trace.tools.map((tool) => `${tool.ok ? "✓" : "✗"} ${tool.name} (${tool.note})`).join(" · ")}
                </p>
              )}
              {turn.error && <p className="mt-1 text-rose-600">{turn.error}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
