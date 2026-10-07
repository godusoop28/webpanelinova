import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BellRing, Check, Clock, ExternalLink, Info, MessageCircle, UsersRound } from "lucide-react";
import type { AssignmentMethod } from "@prisma/client";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigureAssistant } from "@/lib/permissions";
import { phoneDigitsOnly } from "@/lib/phone";
import { priorityLabelForWeight } from "@/lib/advisors";
import { getAdvisorThread } from "@/lib/services/conversation-admin.service";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import {
  ChatBubble,
  DaySeparator,
  DetailRow,
  DetailSection,
  dayKey,
  formatDateTime,
  formatListTime,
  formatTime,
} from "@/components/conversaciones/conversation-view";
import { ChatPane } from "@/components/conversaciones/chat-pane";
import { InboxPage, inboxQuery, parseInboxParams } from "@/components/conversaciones/inbox";
import { cn } from "@/lib/utils";

const METHOD_LABELS: Record<AssignmentMethod, string> = {
  DIRECT_PROPERTY_ADVISOR: "Asesor de la propiedad",
  WEIGHTED_ROTATION: "Ruleta",
  CAMPAIGN_DIRECT: "Campaña",
  MANUAL: "Manual",
  FALLBACK: "Respaldo",
};

export default async function AdvisorThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ advisorId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireSection("conversaciones");
  const { advisorId } = await params;
  const inbox = parseInboxParams(await searchParams, "asesores");
  // Solo lectura de la base: abrir el chat no llama a ManyChat/EasyBroker ni toca asignaciones.
  const thread = await getAdvisorThread(await getDefaultCompanyId(), advisorId);
  if (!thread) notFound();

  const { advisor, assignments, conversation } = thread;
  const now = new Date();
  const paused = Boolean(advisor.pausedUntil && advisor.pausedUntil > now);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const leadsThisWeek = assignments.filter((assignment) => assignment.assignedAt >= weekAgo).length;
  const unconfirmedNotices = assignments.filter((assignment) => !assignment.manyChatNotified).length;
  const waPhone = phoneDigitsOnly(advisor.phone);
  const query = inboxQuery(inbox);
  const backHref = `/conversaciones${query}${query ? "&" : "?"}sel=${advisor.id}`;

  type Item =
    | { kind: "lead"; at: Date; assignment: (typeof assignments)[number] }
    | { kind: "message"; at: Date; message: NonNullable<typeof conversation>["messages"][number] };
  const items: Item[] = [
    ...assignments.map((assignment) => ({ kind: "lead" as const, at: assignment.assignedAt, assignment })),
    ...(conversation?.messages ?? []).map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const routes = [
    advisor.allowedProperty && "Propiedad",
    advisor.allowedExplore && "Explorar",
    advisor.allowedCampaign && "Campaña",
    advisor.allowedTimeout && "Sin respuesta",
  ].filter(Boolean);
  const availability = !advisor.active
    ? { label: "Inactivo", tone: "neutral" as const, detail: "No participa en la distribución." }
    : paused
      ? { label: "En pausa", tone: "warning" as const, detail: `No recibe leads hasta ${formatDateTime(advisor.pausedUntil)}.` }
      : { label: "Disponible", tone: "success" as const, detail: "Puede recibir leads." };

  const details = (
    <>
      <DetailSection title="Asesor">
        <div className="flex items-center gap-3">
          <Avatar name={advisor.name} className="size-12 text-base" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-950">{advisor.name}</p>
            <Badge tone={availability.tone} dot>
              {availability.label}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-ink-500">{availability.detail}</p>
        <dl className="space-y-2">
          <DetailRow label="WhatsApp">{advisor.phone}</DetailRow>
          <DetailRow label="Email">{advisor.email ?? advisor.easyBrokerEmail ?? "—"}</DetailRow>
          <DetailRow label="Prioridad">{priorityLabelForWeight(advisor.weight)}</DetailRow>
          <DetailRow label="Límite diario">{advisor.dailyLimit ?? "Sin límite"}</DetailRow>
          <DetailRow label="Rutas">{routes.length > 0 ? routes.join(", ") : "Ninguna"}</DetailRow>
          <DetailRow label="ManyChat ID">{advisor.manyChatSubscriberId ?? <span className="font-normal text-ink-500">Sin registrar</span>}</DetailRow>
        </dl>
        {!advisor.manyChatSubscriberId && (
          <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Sin ManyChat ID no puede recibir avisos de leads por WhatsApp.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/asesores" className={buttonClass("secondary", "sm")}>
            <UsersRound className="size-3.5" aria-hidden />
            Abrir ficha en Asesores
          </Link>
          {waPhone && (
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>
              WhatsApp <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </DetailSection>

      <DetailSection title="Actividad">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-ink-50 p-3">
            <p className="text-xl font-semibold tabular-nums text-ink-950">{leadsThisWeek}</p>
            <p className="text-[11px] text-ink-500">Leads · últimos 7 días</p>
          </div>
          <div className={cn("rounded-xl p-3", unconfirmedNotices > 0 ? "bg-amber-50" : "bg-ink-50")}>
            <p className={cn("text-xl font-semibold tabular-nums", unconfirmedNotices > 0 ? "text-amber-800" : "text-ink-950")}>{unconfirmedNotices}</p>
            <p className="text-[11px] text-ink-500">Avisos sin confirmar</p>
          </div>
        </div>
      </DetailSection>

      <DetailSection title="Asignaciones recientes">
        {assignments.length === 0 ? (
          <p className="text-xs text-ink-500">Sin asignaciones registradas.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {/* getAdvisorThread devuelve las asignaciones de la más reciente a la más antigua */}
            {assignments.slice(0, 6).map((assignment) => (
                <li key={assignment.id} className="flex items-center gap-2 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <Link href={`/leads/${assignment.lead.id}`} className="block truncate font-medium text-ink-900 hover:text-accent-700 hover:underline">
                      {assignment.lead.name}
                    </Link>
                    <span className="text-[11px] text-ink-500">
                      {METHOD_LABELS[assignment.method]} · {formatListTime(assignment.assignedAt)}
                    </span>
                  </div>
                  {assignment.lead.conversations[0] && (
                    <Link href={`/conversaciones/${assignment.lead.conversations[0].id}`} className="shrink-0 text-xs font-medium text-accent-700 hover:underline">
                      Chat
                    </Link>
                  )}
                </li>
            ))}
          </ul>
        )}
      </DetailSection>
    </>
  );

  return (
    <InboxPage params={inbox} isAdmin={canConfigureAssistant(user.role)} hasSelection selectedId={advisor.id}>
      <ChatPane
        backHref={backHref}
        detailsTitle="Contexto del asesor"
        details={details}
        header={
          <>
            <Avatar name={advisor.name} className="size-11" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink-950">{advisor.name}</p>
              <p className="truncate text-xs text-ink-500">
                {conversation ? "Avisos de leads y mensajes al bot" : "Historial de avisos de nuevos leads"} · {advisor.phone}
              </p>
            </div>
          </>
        }
        footer={
          <p className="flex items-start gap-2 text-xs text-ink-600">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
            {conversation
              ? "Los avisos se envían automáticamente por WhatsApp (ManyChat) al asignar un lead. Los mensajes del asesor al número del bot aparecen aquí. Desde el panel no se envían mensajes a asesores."
              : "Este asesor no ha escrito al número del bot: solo hay avisos automáticos de nuevos leads (salientes). Desde el panel no se envían mensajes a asesores."}
          </p>
        }
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-ink-500">
            <MessageCircle className="size-8 text-ink-300" aria-hidden />
            Este asesor todavía no tiene leads asignados ni mensajes.
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.length >= 100 && <p className="text-center text-xs text-ink-500">Se muestran los últimos 100 avisos.</p>}
            {items.map((item, index) => {
              const showDay = index === 0 || dayKey(items[index - 1].at) !== dayKey(item.at);
              const key = item.kind === "lead" ? `lead-${item.assignment.id}` : `msg-${item.message.id}`;
              return (
                <div key={key} className="space-y-4">
                  {showDay && <DaySeparator date={item.at} />}
                  {item.kind === "message" && conversation ? (
                    <ChatBubble message={item.message} contactName={advisor.name} conversationId={conversation.id} />
                  ) : item.kind === "lead" ? (
                    <LeadNotice assignment={item.assignment} />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </ChatPane>
    </InboxPage>
  );
}

type Assignment = NonNullable<Awaited<ReturnType<typeof getAdvisorThread>>>["assignments"][number];

/** Aviso automático de nuevo lead (saliente hacia el asesor), con su estado real de envío. */
function LeadNotice({ assignment }: { assignment: Assignment }) {
  const lead = assignment.lead;
  const clientConversationId = lead.conversations[0]?.id;
  return (
    <div className="flex items-end justify-end gap-2">
      <div className="flex max-w-[88%] flex-col items-end sm:max-w-[72%]">
        <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-medium text-ink-500">
          <BellRing className="size-3" aria-hidden />
          Aviso automático
        </span>
        <div className="w-full overflow-hidden rounded-2xl rounded-br-md border border-accent-200 bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-accent-100 px-3.5 py-2 text-sm font-semibold text-ink-950">
            Nuevo lead asignado
            <span className="rounded-full bg-surface/70 px-2 py-px text-[10px] font-medium text-accent-800">{METHOD_LABELS[assignment.method]}</span>
          </div>
          <div className="space-y-1 px-3.5 py-2.5 text-sm">
            <p className="font-semibold text-ink-950">{lead.name}</p>
            <p className="text-ink-600">{lead.phone}</p>
            {(lead.route || lead.origin) && <p className="text-xs text-ink-500">{[lead.route, lead.origin].filter(Boolean).join(" · ")}</p>}
            {lead.propertyData && <p className="line-clamp-2 text-xs text-ink-500">Referencia: {lead.propertyData}</p>}
            <p className="pt-1 text-right text-[11px] text-ink-500">{formatTime(assignment.assignedAt)}</p>
          </div>
          <div className="flex divide-x divide-ink-100 border-t border-ink-100 text-xs font-medium">
            {clientConversationId && (
              <Link href={`/conversaciones/${clientConversationId}`} className="flex-1 px-3 py-2 text-center text-accent-700 hover:bg-accent-50">
                Chat del cliente
              </Link>
            )}
            <Link href={`/leads/${lead.id}`} className="flex-1 px-3 py-2 text-center text-accent-700 hover:bg-accent-50">
              Ver lead
            </Link>
          </div>
        </div>
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-ink-500">
          {assignment.manyChatNotified ? (
            <>
              <Check className="size-3.5 text-emerald-600" aria-hidden />
              Avisado por WhatsApp
            </>
          ) : (
            <>
              <Clock className="size-3.5 text-amber-600" aria-hidden />
              <span className="font-medium text-amber-800">Envío del aviso sin confirmar</span>
            </>
          )}
        </div>
      </div>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-800" aria-hidden>
        <BellRing className="size-3.5" />
      </div>
    </div>
  );
}
