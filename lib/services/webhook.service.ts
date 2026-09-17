import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export { buildLeadFingerprint } from "@/lib/fingerprint";

/**
 * Records the webhook delivery in WebhookEvent (for the processing-attempts
 * / audit trail Fase 15 asks for) and reports whether a Lead with this
 * requestId already exists — the actual dedup gate the caller must honor
 * before creating a new Lead, calling EasyBroker, or notifying ManyChat.
 */
export async function recordWebhookDelivery(input: {
  provider: string;
  externalId?: string;
  eventType: string;
  payload: unknown;
  requestId: string;
}): Promise<{ isDuplicateLead: boolean; webhookEventId: string | null }> {
  const existingLead = await prisma.lead.findUnique({ where: { requestId: input.requestId }, select: { id: true } });

  let webhookEventId: string | null = null;
  try {
    const event = await prisma.webhookEvent.create({
      data: {
        provider: input.provider,
        externalId: input.externalId,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue,
        status: existingLead ? "duplicate" : "received",
      },
    });
    webhookEventId = event.id;
  } catch {
    // Unique violation on (provider, externalId): a genuine repeat delivery
    // of the same event. Not fatal — the Lead.requestId check above is the
    // real dedup gate; this table is the audit trail on top of it.
  }

  return { isDuplicateLead: Boolean(existingLead), webhookEventId };
}

export async function markWebhookEventProcessed(webhookEventId: string | null, error?: string): Promise<void> {
  if (!webhookEventId || webhookEventId === "duplicate-webhook-event") return;
  try {
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        status: error ? "failed" : "processed",
        processedAt: new Date(),
        processingAttempts: { increment: 1 },
        lastError: error,
      },
    });
  } catch (updateError) {
    console.error("[WEBHOOK] failed to mark event processed", updateError);
  }
}
