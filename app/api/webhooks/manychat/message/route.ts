import { NextResponse, after } from "next/server";
import type { NextRequest } from "next/server";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { ManyChatMessageWebhookSchema } from "@/lib/schemas";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { parseLenientJson } from "@/lib/lenient-json";
import { ingestInboundMessage } from "@/lib/services/conversation.service";
import { processConversation } from "@/lib/services/conversation-processor.service";
import { logAuditEvent } from "@/lib/services/audit.service";

/** after() espera la ráfaga, llama a OpenAI/EasyBroker y envía; el cron cubre si esto se corta. */
export const maxDuration = 120;

const MAX_BODY_BYTES = 16 * 1024;
/** Más de esto por minuto y contacto no es una persona escribiendo. */
const MAX_MESSAGES_PER_MINUTE = 30;

/**
 * Entrada del asistente conversacional. ManyChat (External Request desde la
 * automatización de respuesta predeterminada) manda cada mensaje de
 * WhatsApp; aquí solo se autentica, valida y PERSISTE, y se responde de
 * inmediato. La interpretación y la respuesta ocurren después (after() +
 * cron de recuperación) y se envían por la API de ManyChat (sendContent),
 * nunca manteniendo abierta esta petición.
 *
 * Respuesta: { ok, handled: "true" | "false" }. ManyChat guarda `handled`
 * en un campo; "false" significa que el asistente no atiende a este
 * contacto (apagado o fuera de prueba) y la automatización debe seguir con
 * el flujo anterior.
 */
export async function POST(request: NextRequest) {
  const authError = checkIntegrationSecret(request);
  if (authError) return authError;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, handled: "false", error: "DATABASE_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, handled: "false", error: "BODY_TOO_LARGE" }, { status: 413 });
  }

  let body: unknown;
  try {
    // ManyChat pega el texto del cliente crudo dentro del JSON (saltos de línea incluidos).
    body = parseLenientJson(rawBody);
  } catch {
    return NextResponse.json({ ok: false, handled: "false", error: "INVALID_BODY" }, { status: 400 });
  }

  const parsed = ManyChatMessageWebhookSchema.safeParse(body);
  if (!parsed.success) {
    await logAuditEvent({
      companyId: await getDefaultCompanyId(),
      eventType: "WEBHOOK_REJECTED",
      status: "error",
      message: "Mensaje de conversación rechazado: payload inválido.",
      metadata: { issues: parsed.error.issues },
    });
    return NextResponse.json({ ok: false, handled: "false", error: "INVALID_PAYLOAD" }, { status: 422 });
  }
  const payload = parsed.data;
  const companyId = await getDefaultCompanyId();

  const recent = await prisma.conversationMessage.count({
    where: {
      companyId,
      role: "USER",
      createdAt: { gte: new Date(Date.now() - 60_000) },
      conversation: { manyChatSubscriberId: payload.subscriber_id },
    },
  });
  if (recent >= MAX_MESSAGES_PER_MINUTE) {
    // handled=true: no queremos que el flujo anterior conteste una ráfaga abusiva.
    return NextResponse.json({ ok: false, handled: "true", error: "RATE_LIMITED" }, { status: 429 });
  }

  const result = await ingestInboundMessage(companyId, {
    subscriberId: payload.subscriber_id,
    // Imágenes/audios llegan sin texto: se registran igual para no perder el turno.
    text: payload.text ?? "[El cliente envió un mensaje sin texto (imagen, audio o archivo)]",
    phone: payload.phone,
    name: payload.name,
    messageId: payload.message_id,
    interactionAt: payload.last_interaction,
  });

  if (!result.duplicate && result.shouldProcess) {
    const conversationId = result.conversationId;
    after(async () => {
      try {
        await processConversation(conversationId, 110_000);
      } catch (error) {
        // El mensaje ya está guardado: el cron por minuto lo retoma.
        console.error("[ASSISTANT] procesamiento en after() falló", conversationId, error);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    handled: result.handled ? "true" : "false",
    duplicate: result.duplicate,
  });
}
