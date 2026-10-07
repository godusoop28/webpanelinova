import { notFound } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { canConfigureAssistant } from "@/lib/permissions";
import { conversationStatus, getConversationDetail } from "@/lib/services/conversation-admin.service";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ControlForms, HumanReplyForm } from "@/components/conversaciones/action-forms";
import { ConversationStatePanel, MessageTimeline, TurnTrace } from "@/components/conversaciones/conversation-view";
import { ChatPane } from "@/components/conversaciones/chat-pane";
import { InboxPage, inboxQuery, parseInboxParams } from "@/components/conversaciones/inbox";

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
  const inbox = parseInboxParams(await searchParams, "clientes");
  const conversation = await getConversationDetail(await getDefaultCompanyId(), id);
  if (!conversation) notFound();

  const name = conversation.name ?? conversation.phone ?? conversation.manyChatSubscriberId;
  const status = conversationStatus(conversation);
  const query = inboxQuery(inbox);
  const backHref = `/conversaciones${query}${query ? "&" : "?"}sel=${conversation.id}`;

  const details = (
    <>
      <ConversationStatePanel
        conversation={conversation}
        bare
        controls={
          <div className="space-y-2 rounded-xl border border-ink-200 p-3">
            <p className="text-xs font-semibold text-ink-800">Control de la IA</p>
            <p className="text-[11px] leading-relaxed text-ink-500">
              La espera tras canalizar vence sola. Una pausa hecha aquí no vence: úsala si una persona atiende desde la bandeja de ManyChat.
            </p>
            <ControlForms conversationId={conversation.id} control={conversation.control} />
          </div>
        }
      />
      <TurnTrace conversation={conversation} bare />
    </>
  );

  return (
    <InboxPage params={inbox} isAdmin={canConfigureAssistant(user.role)} hasSelection selectedId={conversation.id}>
      <ChatPane
        backHref={backHref}
        detailsTitle="Contexto del cliente"
        details={details}
        header={
          <>
            <Avatar name={name} className="size-11" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-ink-950">{name}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                <span className="whitespace-nowrap">{conversation.phone ?? "Sin teléfono"}</span>
                <Badge tone={status.tone} className="px-2 py-0 text-[11px]">
                  {status.label}
                </Badge>
                {conversation.isTest && (
                  <Badge tone="neutral" className="px-2 py-0 text-[11px]">
                    Prueba
                  </Badge>
                )}
              </div>
            </div>
          </>
        }
        footer={<HumanReplyForm conversationId={conversation.id} />}
      >
        <MessageTimeline conversation={conversation} />
      </ChatPane>
    </InboxPage>
  );
}
