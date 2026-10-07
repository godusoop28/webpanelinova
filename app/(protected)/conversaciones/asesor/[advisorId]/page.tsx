import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, BellRing, Check, Clock, ExternalLink, Info, MessageCircle } from "lucide-react";
import type { AssignmentMethod } from "@prisma/client";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigureAssistant } from "@/lib/permissions";
import { phoneDigitsOnly } from "@/lib/phone";
import { getAdvisorThread } from "@/lib/services/conversation-admin.service";
import { Badge } from "@/components/ui/badge";
import { Avatar, ChatBubble, DaySeparator, DetailRow, DetailSection, formatDateTime, formatTime } from "@/components/conversaciones/conversation-view";
import { ChatPane } from "@/components/conversaciones/chat-pane";
import { InboxList, InboxShell, inboxQuery, parseInboxParams } from "@/components/conversaciones/inbox";
import { cn } from "@/lib/utils";

const METHOD_LABELS: Record<AssignmentMethod, string> = {
  DIRECT_PROPERTY_ADVISOR: "Asesor de la propiedad",
  WEIGHTED_ROTATION: "Ruleta",
  CAMPAIGN_DIRECT: "Campaña",
  MANUAL: "Manual",
  FALLBACK: "Respaldo",
};

const dayKey = (value: Date) => value.toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

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
  const thread = await getAdvisorThread(await getDefaultCompanyId(), advisorId);
  if (!thread) notFound();

  const { advisor, assignments, conversation } = thread;
  const now = new Date();
  const paused = Boolean(advisor.pausedUntil && advisor.pausedUntil > now);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const leadsThisWeek = assignments.filter((assignment) => assignment.assignedAt >= weekAgo).length;
  const pendingNotices = assignments.filter((assignment) => !assignment.manyChatNotified).length;
  const waPhone = phoneDigitsOnly(advisor.phone);

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

  const details = (
    <>
      <div className="flex flex-col items-center gap-2 border-b border-ink-100 px-5 py-6 text-center">
        <Avatar name={advisor.name} className="size-16 text-xl" />
        <div>
          <p className="text-base font-semibold text-ink-900">{advisor.name}</p>
          <p className="text-xs text-ink-500">{advisor.phone}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <Badge tone={!advisor.active ? "neutral" : paused ? "warning" : "success"}>{!advisor.active ? "Inactivo" : paused ? "En pausa" : "Activo"}</Badge>
        </div>
      </div>
      <DetailSection title="Actividad">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-ink-50 p-3">
            <p className="text-xl font-semibold text-ink-900">{leadsThisWeek}</p>
            <p className="text-[11px] text-ink-500">Leads · 7 días</p>
          </div>
          <div className={cn("rounded-lg p-3", pendingNotices > 0 ? "bg-amber-50" : "bg-ink-50")}>
            <p className={cn("text-xl font-semibold", pendingNotices > 0 ? "text-amber-800" : "text-ink-900")}>{pendingNotices}</p>
            <p className="text-[11px] text-ink-500">Avisos pendientes</p>
          </div>
        </div>
      </DetailSection>
      <DetailSection title="Distribución">
        <dl className="space-y-1.5">
          <DetailRow label="Peso">{advisor.weight}</DetailRow>
          <DetailRow label="Límite diario">{advisor.dailyLimit ?? "Sin límite"}</DetailRow>
          <DetailRow label="Pausa hasta">{paused ? formatDateTime(advisor.pausedUntil) : "—"}</DetailRow>
          <DetailRow label="Rutas">{routes.length > 0 ? routes.join(", ") : "Ninguna"}</DetailRow>
        </dl>
      </DetailSection>
      <DetailSection title="WhatsApp / ManyChat">
        <dl className="space-y-1.5">
          <DetailRow label="ManyChat ID">{advisor.manyChatSubscriberId ?? "—"}</DetailRow>
          <DetailRow label="Escribe al bot">{conversation ? "Sí" : "No"}</DetailRow>
        </dl>
        {!advisor.manyChatSubscriberId && (
          <p className="flex gap-1.5 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Sin ManyChat ID: no puede recibir avisos de leads por WhatsApp.
          </p>
        )}
        <div className="flex flex-wrap gap-3 pt-1 text-xs font-medium">
          {waPhone && (
            <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent-700 hover:underline">
              Abrir WhatsApp <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
          <Link href="/asesores" className="inline-flex items-center gap-1 text-accent-700 hover:underline">
            Editar asesor
          </Link>
        </div>
      </DetailSection>
    </>
  );

  return (
    <InboxShell
      hasSelection
      list={<InboxList params={inbox} selectedId={advisor.id} basePath={`/conversaciones/asesor/${advisor.id}`} isAdmin={canConfigureAssistant(user.role)} />}
    >
      <ChatPane
        backHref={`/conversaciones${inboxQuery(inbox)}`}
        detailsTitle="Detalles del asesor"
        details={details}
        header={
          <>
            <Avatar name={advisor.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{advisor.name}</p>
              <p className="truncate text-xs text-ink-500">Asesor · {advisor.phone}</p>
            </div>
          </>
        }
        footer={
          <p className="flex items-start gap-2 text-xs text-ink-500">
            <Info className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
            Los avisos de nuevos leads se envían automáticamente por WhatsApp (ManyChat) al asignar. Los mensajes que el asesor escribe al número del bot
            aparecen aquí.
          </p>
        }
      >
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center text-sm text-ink-500">
            <MessageCircle className="size-8 text-ink-300" aria-hidden />
            Este asesor todavía no tiene leads asignados ni mensajes.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => {
              const showDay = index === 0 || dayKey(items[index - 1].at) !== dayKey(item.at);
              const key = item.kind === "lead" ? `lead-${item.assignment.id}` : `msg-${item.message.id}`;
              return (
                <div key={key} className="space-y-3">
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
    </InboxShell>
  );
}

type Assignment = NonNullable<Awaited<ReturnType<typeof getAdvisorThread>>>["assignments"][number];

/** Aviso de nuevo lead tal como lo recibe el asesor por WhatsApp (tarjeta saliente). */
function LeadNotice({ assignment }: { assignment: Assignment }) {
  const lead = assignment.lead;
  const clientConversationId = lead.conversations[0]?.id;
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[85%] flex-col items-end sm:max-w-[70%]">
        <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-medium text-ink-400">
          <BellRing className="size-3" aria-hidden />
          Aviso automático
        </span>
        <div className="w-full overflow-hidden rounded-2xl rounded-br-md border border-accent-100 bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-2 bg-accent-600 px-3.5 py-2 text-sm font-medium text-white">
            Nuevo lead asignado
            <span className="rounded-full bg-white/20 px-2 py-px text-[10px] font-medium">{METHOD_LABELS[assignment.method]}</span>
          </div>
          <div className="space-y-1 px-3.5 py-2.5 text-sm">
            <p className="font-semibold text-ink-900">{lead.name}</p>
            <p className="text-ink-600">{lead.phone}</p>
            {(lead.route || lead.origin) && <p className="text-xs text-ink-500">{[lead.route, lead.origin].filter(Boolean).join(" · ")}</p>}
            {lead.propertyData && <p className="line-clamp-2 text-xs text-ink-500">Referencia: {lead.propertyData}</p>}
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
        <div className="mt-1 flex items-center gap-1.5 px-1 text-[11px] text-ink-400">
          <span>{formatTime(assignment.assignedAt)}</span>
          {assignment.manyChatNotified ? (
            <>
              <Check className="size-3.5 text-emerald-600" aria-hidden />
              <span>Avisado por WhatsApp</span>
            </>
          ) : (
            <>
              <Clock className="size-3.5 text-amber-600" aria-hidden />
              <span className="font-medium text-amber-700">Aviso pendiente</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
