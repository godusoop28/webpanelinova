import "server-only";
import { manyChatRequest, ManyChatApiError, ManyChatTimeoutError } from "@/lib/integrations/manychat.client";
import { classifyManyChatFailure, ManyChatConfigError } from "@/lib/integrations/manychat-errors";
import { withRetry } from "@/lib/retry";
import { env } from "@/lib/env";
import { fitAdvisorLeadFields } from "@/lib/advisor-notice";

const RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 6000 };
/**
 * Reintento inmediato solo para fallos recuperables sin Retry-After: si
 * ManyChat pide esperar, la espera la respeta la cola de reintentos.
 */
function inlineRetryable(idempotent: boolean) {
  return (error: unknown) => {
    const failure = classifyManyChatFailure(error, { idempotent });
    return failure.retryable && failure.retryAfterMs == null;
  };
}

export interface ManyChatCustomField {
  fieldId: number;
  value: string;
}

/**
 * Custom field IDs (like the ones baked into the old Make scenario) are
 * ManyChat-account-specific, not secrets — but per Fase 22/61 they still
 * don't belong hardcoded in this file. Callers that have them (Integration
 * config row, once someone fills it in) pass them in; this function stays
 * generic.
 */
export async function setCustomFields(subscriberId: string, fields: ManyChatCustomField[]): Promise<void> {
  if (fields.length === 0) return;
  await withRetry(
    () =>
      manyChatRequest({
        path: "/fb/subscriber/setCustomFields",
        body: {
          subscriber_id: subscriberId,
          fields: fields.map((f) => ({ field_id: f.fieldId, field_value: f.value })),
        },
      }),
    // Escribir campos es idempotente: un timeout sí puede repetirse.
    { ...RETRY_OPTIONS, shouldRetry: inlineRetryable(true) }
  );
}

/**
 * Reintenta en la misma petición solo 429/5xx. Un 4xx es permanente y un
 * timeout es ambiguo (el flujo pudo haberse enviado): ambos se devuelven
 * al llamador sin repetir el envío.
 */
export async function sendFlow(subscriberId: string, flowNs: string): Promise<void> {
  await withRetry(
    () => manyChatRequest({ path: "/fb/sending/sendFlow", body: { subscriber_id: subscriberId, flow_ns: flowNs } }),
    { ...RETRY_OPTIONS, shouldRetry: inlineRetryable(false) }
  );
}

/**
 * High-level "tell the advisor about their new lead". Custom fields are
 * best-effort: if `customFields` isn't supplied (no Integration config for
 * field-id mapping yet), we still send the flow so the advisor gets
 * notified — a missing cosmetic field must never block the notification
 * itself (Fase 16: "NO perder el lead" applies here too).
 */
export async function notifyAdvisor(input: {
  advisorManyChatSubscriberId: string;
  flowNs?: string;
  customFields?: ManyChatCustomField[];
}): Promise<{ customFieldsUpdated: boolean }> {
  const flowNs = input.flowNs ?? env.manychat.advisorFlowId;
  if (!flowNs) {
    throw new ManyChatConfigError("MANYCHAT_ADVISOR_FLOW_ID", "Falta MANYCHAT_ADVISOR_FLOW_ID: no hay flujo configurado para avisar al asesor.");
  }

  let customFieldsUpdated = false;
  if (input.customFields && input.customFields.length > 0) {
    // Todos los avisos usan la misma plantilla: se ajustan a su límite de cuerpo.
    await setCustomFields(input.advisorManyChatSubscriberId, fitAdvisorLeadFields(input.customFields));
    customFieldsUpdated = true;
  }
  await sendFlow(input.advisorManyChatSubscriberId, flowNs);
  return { customFieldsUpdated };
}

/**
 * Mensaje de texto libre por WhatsApp (formato Dynamic Block v2 con
 * content.type "whatsapp", documentado por ManyChat para sendContent).
 * Solo válido dentro de la ventana de 24 h desde el último mensaje del
 * cliente: fuera de ella WhatsApp exige plantilla y ManyChat responde error.
 *
 * SIN reintento interno a propósito: un timeout es ambiguo (ManyChat pudo
 * haberlo entregado) y reintentarlo duplicaría el mensaje. Quien llama
 * (el outbox de conversaciones) decide según el tipo de error.
 */
export async function sendWhatsAppText(subscriberId: string, text: string): Promise<void> {
  await manyChatRequest({
    path: "/fb/sending/sendContent",
    body: {
      subscriber_id: Number(subscriberId),
      data: {
        version: "v2",
        content: { type: "whatsapp", messages: [{ type: "text", text }] },
      },
    },
    timeoutMs: 12000,
  });
}

export interface ManyChatSubscriberInfo {
  id: string;
  name?: string;
  first_name?: string;
  whatsapp_phone?: string;
  phone?: string;
  live_chat_url?: string;
  last_interaction?: string | null;
  tags?: { id: number; name: string }[];
}

/**
 * sendFlow SIN reintento interno: un timeout es ambiguo (el flujo con la
 * plantilla pudo haberse enviado) y reintentarlo duplicaría el reporte.
 * Quien llama marca el envío como incierto.
 */
export async function sendFlowOnce(subscriberId: string, flowNs: string): Promise<void> {
  await manyChatRequest({ path: "/fb/sending/sendFlow", body: { subscriber_id: Number(subscriberId), flow_ns: flowNs }, timeoutMs: 12000 });
}

/** GET /fb/subscriber/findBySystemField?phone= (documentado en la API de ManyChat). */
export async function findSubscriberByPhone(phoneE164: string): Promise<ManyChatSubscriberInfo | null> {
  const result = await manyChatRequest<{ data?: ManyChatSubscriberInfo | ManyChatSubscriberInfo[] }>({
    method: "GET",
    path: "/fb/subscriber/findBySystemField",
    query: { phone: phoneE164 },
  });
  const data = Array.isArray(result.data) ? result.data[0] : result.data;
  return data ?? null;
}

export async function getSubscriberInfo(subscriberId: string): Promise<ManyChatSubscriberInfo | null> {
  const result = await manyChatRequest<{ data?: ManyChatSubscriberInfo }>({
    method: "GET",
    path: "/fb/subscriber/getInfo",
    query: { subscriber_id: subscriberId },
  });
  return result.data ?? null;
}

export { ManyChatApiError, ManyChatTimeoutError, ManyChatConfigError };
