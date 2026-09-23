import "server-only";
import { manyChatRequest, ManyChatApiError } from "@/lib/integrations/manychat.client";
import { withRetry } from "@/lib/retry";
import { env } from "@/lib/env";

const RETRY_OPTIONS = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 6000 };

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
    RETRY_OPTIONS
  );
}

export async function sendFlow(subscriberId: string, flowNs: string): Promise<void> {
  await withRetry(
    () => manyChatRequest({ path: "/fb/sending/sendFlow", body: { subscriber_id: subscriberId, flow_ns: flowNs } }),
    RETRY_OPTIONS
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
    throw new Error("MANYCHAT_ADVISOR_FLOW_ID no está configurado y no se pasó un flowNs explícito.");
  }

  let customFieldsUpdated = false;
  if (input.customFields && input.customFields.length > 0) {
    await setCustomFields(input.advisorManyChatSubscriberId, input.customFields);
    customFieldsUpdated = true;
  }
  await sendFlow(input.advisorManyChatSubscriberId, flowNs);
  return { customFieldsUpdated };
}

export { ManyChatApiError };
