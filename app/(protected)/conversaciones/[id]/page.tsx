import Link from "next/link";
import { notFound } from "next/navigation";
import { UserSquare2 } from "lucide-react";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigureAssistant } from "@/lib/permissions";
import { conversationStatus, getConversationDetail } from "@/lib/services/conversation-admin.service";
import { Badge } from "@/components/ui/badge";
import { ControlForms, HumanReplyForm } from "@/components/conversaciones/action-forms";
import { Avatar, ConversationStatePanel, DetailSection, MessageTimeline, TurnTrace } from "@/components/conversaciones/conversation-view";
import { ChatPane } from "@/components/conversaciones/chat-pane";
import { InboxList, InboxShell, inboxQuery, parseInboxParams } from "@/components/conversaciones/inbox";

/** Reanudar o reintentar pueden procesar en after(). */
export const maxDuration = 120;

export default async function ConversationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string; page?: string; f?: string; tab?: string }>;
}) {
  const user = await requireSection("conversaciones");
  const { id } = await params;
  const inbox = parseInboxParams(await searchParams);
  const conversation = await getConversationDetail(await getDefaultCompanyId(), id);
  if (!conversation) notFound();

  const name = conversation.name ?? conversation.phone ?? conversation.manyChatSubscriberId;
  const status = conversationStatus(conversation);
  const advisor = conversation.lead?.assignedAdvisor;
  const query = inboxQuery(inbox);

  const details = (
    <>
      <div className="flex flex-col items-center gap-2 border-b border-ink-100 px-5 py-6 text-center">
        <Avatar name={name} className="size-16 text-xl" />
        <div>
          <p className="text-base font-semibold text-ink-900">{name}</p>
          <p className="text-xs text-ink-500">{conversation.phone ?? "Sin teléfono"}</p>
        </div>
      </div>
      <DetailSection title="Control de la IA">
        <p className="text-xs leading-relaxed text-ink-500">
          La espera tras canalizar vence sola. Una pausa hecha aquí no vence: úsala si una persona atiende desde la bandeja de ManyChat.
        </p>
        <ControlForms conversationId={conversation.id} control={conversation.control} />
      </DetailSection>
      <ConversationStatePanel conversation={conversation} bare />
      <TurnTrace conversation={conversation} bare />
    </>
  );

  return (
    <InboxShell
      hasSelection
      list={<InboxList params={inbox} selectedId={conversation.id} basePath={`/conversaciones/${conversation.id}`} isAdmin={canConfigureAssistant(user.role)} />}
    >
      <ChatPane
        backHref={`/conversaciones${query}`}
        detailsTitle="Detalles del contacto"
        details={details}
        header={
          <>
            <Avatar name={name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
              <div className="flex min-w-0 items-center gap-1.5 text-xs text-ink-500">
                <Badge tone={status.tone} className="px-2 py-0 text-[11px]">
                  {status.label}
                </Badge>
                {conversation.isTest && (
                  <Badge tone="gold" className="px-2 py-0 text-[11px]">
                    Prueba
                  </Badge>
                )}
                <span className="hidden truncate sm:inline">{conversation.phone}</span>
              </div>
            </div>
          </>
        }
        actions={
          advisor ? (
            <Link
              href={`/conversaciones/asesor/${advisor.id}?tab=asesores`}
              className="hidden items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:bg-ink-50 sm:inline-flex"
              title="Ver chat con el asesor asignado"
            >
              <UserSquare2 className="size-3.5 text-emerald-600" aria-hidden />
              <span className="max-w-[10rem] truncate">{advisor.name}</span>
            </Link>
          ) : null
        }
        footer={<HumanReplyForm conversationId={conversation.id} />}
      >
        <MessageTimeline conversation={conversation} />
      </ChatPane>
    </InboxShell>
  );
}
