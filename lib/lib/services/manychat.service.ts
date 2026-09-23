import "server-only";
import { manyChatRequest, ManyChatApiError } from "@/lib/integrations/manychat.client";
import { withRetry } from "@/lib/retry";
import { env } from "@/lib/env";

// Actualizar campos es idempotente: si hay un fallo de red se puede repetir
// sin generar mensajes duplicados. El envío del Flow NO se reintenta aquí;
// si falla, retry.service.ts lo reintenta de forma controlada.
const FIELD_RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 6000 };

export interface ManyChatCustomField {
  fieldId: number;
  value: string;
}

/**
 * IDs de los Custom User Fields usados por el Flow "Aviso asesor nuevo lead"
 * de la cuenta actual de Century 21 Inova.
 *
 * El problema de campañas ocurría porque el Flow se ejecutaba sin escribir
 * estos campos con el lead actual. ManyChat entonces reutilizaba los valores
 * que habían quedado guardados del lead anterior en el contacto del asesor.
 */
export const ADVISOR_LEAD_FIELD_IDS = {
  name: 14780313,
  phone: 14780314,
  requestType: 14780316,
  relatedInfo: 14780317,
  reference: 14780318,
  contactUrl: 14780319,
} as const;

export function buildAdvisorLeadCustomFields(input: {
  name: string;
  phone: string;
  requestType: string;
  reference: string;
  relatedInfo: string;
  contactUrl?: string;
}): ManyChatCustomField[] {
  const digits = input.phone.replace(/\D/g, "");
  const contactUrl = input.contactUrl?.trim() || (digits ? `https://wa.me/${digits}` : "");

  return [
    { fieldId: ADVISOR_LEAD_FIELD_IDS.name, value: input.name.trim() || "Sin nombre" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.phone, value: input.phone.trim() || "Sin teléfono" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.requestType, value: input.requestType.trim() || "Sin tipo" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.reference, value: input.reference.trim() || "Sin referencia" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.relatedInfo, value: input.relatedInfo.trim() || "Sin información adicional" },
    { fieldId: ADVISOR_LEAD_FIELD_IDS.contactUrl, value: contactUrl },
  ];
}

export async function setCustomFields(subscriberId: string, fields: ManyChatCustomField[]): Promise<void> {
  if (fields.length === 0) {
    throw new Error("No se puede notificar al asesor sin los Custom Fields del lead actual.");
  }

  await withRetry(
    () =>
      manyChatRequest({
        path: "/fb/subscriber/setCustomFields",
        body: {
          subscriber_id: subscriberId,
          fields: fields.map((f) => ({ field_id: f.fieldId, field_value: f.value })),
        },
      }),
    FIELD_RETRY_OPTIONS
  );
}

/**
 * No hacer retries inmediatos aquí. sendFlow tiene efectos reales (manda el
 * mensaje). Si ManyChat sí lo procesa pero se pierde la respuesta, repetir la
 * llamada puede duplicar el WhatsApp. Los reintentos controlados viven en la
 * cola IntegrationJob.
 */
export async function sendFlow(subscriberId: string, flowNs: string): Promise<void> {
  await manyChatRequest({
    path: "/fb/sending/sendFlow",
    body: { subscriber_id: subscriberId, flow_ns: flowNs },
  });
}

/**
 * Notifica al asesor de forma segura: primero reemplaza TODOS los campos del
 * lead en el contacto del asesor y sólo después ejecuta el Flow. Si falla la
 * escritura de campos, el Flow no se ejecuta, evitando mostrar el lead previo.
 */
export async function notifyAdvisor(input: {
  advisorManyChatSubscriberId: string;
  customFields: ManyChatCustomField[];
  flowNs?: string;
}): Promise<{ customFieldsUpdated: true }> {
  const flowNs = input.flowNs ?? env.manychat.advisorFlowId;
  if (!flowNs) {
    throw new Error("MANYCHAT_ADVISOR_FLOW_ID no está configurado y no se pasó un flowNs explícito.");
  }

  if (input.customFields.length === 0) {
    throw new Error("No se puede ejecutar el Flow del asesor sin los datos del lead actual.");
  }

  await setCustomFields(input.advisorManyChatSubscriberId, input.customFields);
  await sendFlow(input.advisorManyChatSubscriberId, flowNs);

  return { customFieldsUpdated: true };
}

export { ManyChatApiError };
