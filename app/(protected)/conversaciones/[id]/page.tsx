import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSection } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { getConversationDetail } from "@/lib/services/conversation-admin.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ControlForms, HumanReplyForm } from "@/components/conversaciones/action-forms";
import { ConversationStatePanel, MessageTimeline, TurnTrace } from "@/components/conversaciones/conversation-view";

/** Reanudar o reintentar pueden procesar en after(). */
export const maxDuration = 120;

export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection("conversaciones");
  const { id } = await params;
  const conversation = await getConversationDetail(await getDefaultCompanyId(), id);
  if (!conversation) notFound();

  return (
    <div className="space-y-5">
      <div>
        <Link href="/conversaciones" className="text-xs text-ink-500 hover:underline">
          ← Conversaciones
        </Link>
        <h1 className="text-xl font-semibold text-ink-900">{conversation.name ?? conversation.phone ?? conversation.manyChatSubscriberId}</h1>
        <p className="text-sm text-ink-500">{conversation.phone ?? "Sin teléfono"}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Historial</CardTitle>
                <CardDescription>
                  Solo mensajes capturados por este sistema desde su activación. &quot;Enviado a ManyChat&quot; significa aceptado por ManyChat, no leído por el
                  cliente.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <MessageTimeline conversation={conversation} />
            </CardContent>
          </Card>
          <TurnTrace conversation={conversation} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Control de la IA</CardTitle>
                <CardDescription>
                  La espera tras canalizar vence sola. Una pausa hecha aquí NO vence: úsala si una persona atiende desde la bandeja de ManyChat (ManyChat no informa al
                  sistema de esa toma).
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ControlForms conversationId={conversation.id} control={conversation.control} />
              <HumanReplyForm conversationId={conversation.id} />
            </CardContent>
          </Card>
          <ConversationStatePanel conversation={conversation} />
        </div>
      </div>
    </div>
  );
}
