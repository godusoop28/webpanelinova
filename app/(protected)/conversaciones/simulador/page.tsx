import Link from "next/link";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { getConversationDetail } from "@/lib/services/conversation-admin.service";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulatorForm } from "@/components/conversaciones/action-forms";
import { ConversationStatePanel, MessageTimeline, TurnTrace } from "@/components/conversaciones/conversation-view";

/** El envío simulado procesa en after(): OpenAI + EasyBroker en solo lectura. */
export const maxDuration = 120;

export default async function SimuladorPage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string }> }) {
  await requireRole("ADMIN");
  const { c, s } = await searchParams;
  const conversation = c ? await getConversationDetail(await getDefaultCompanyId(), c) : null;
  const subscriberId = conversation?.isTest && s && conversation.manyChatSubscriberId === s ? s : undefined;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/conversaciones" className="text-xs text-ink-500 hover:underline">
          ← Conversaciones
        </Link>
        <h1 className="text-xl font-semibold text-ink-900">Simulador del asistente</h1>
        <p className="text-sm text-ink-500">
          Mismo pipeline real (agrupación, OpenAI, inventario de EasyBroker en solo lectura), pero no envía WhatsApp, no crea leads, no mueve la ruleta ni avisa a
          nadie: las canalizaciones muestran a quién le tocaría. Recarga la página unos segundos después de enviar.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{conversation ? "Conversación simulada" : "Nueva conversación simulada"}</CardTitle>
                <CardDescription>
                  {conversation ? (
                    <>
                      Envía varios mensajes seguidos para probar la agrupación.{" "}
                      <Link href="/conversaciones/simulador" className="text-gold-700 hover:underline">
                        Empezar otra
                      </Link>
                    </>
                  ) : (
                    "Escribe como lo haría un cliente."
                  )}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversation && <MessageTimeline conversation={conversation} />}
              <SimulatorForm subscriberId={subscriberId} />
            </CardContent>
          </Card>
          {conversation && <TurnTrace conversation={conversation} />}
        </div>
        {conversation && <ConversationStatePanel conversation={conversation} />}
      </div>
    </div>
  );
}
