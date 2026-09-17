import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { IncomingLeadWebhookSchema } from "@/lib/schemas";
import { isDatabaseConfigured } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { buildLeadFingerprint, recordWebhookDelivery, markWebhookEventProcessed } from "@/lib/services/webhook.service";
import { processIncomingLead } from "@/lib/services/lead.service";
import { findLeadByRequestId } from "@/lib/repositories/lead.repository";
import { logAuditEvent } from "@/lib/services/audit.service";

/**
 * Fase 14: real intake endpoint for ManyChat's lead flow, kept payload-
 * compatible with what it already sends to Make today so the ManyChat flow
 * itself doesn't need to change yet (Fase 45's cutover plan repoints it
 * here later — not part of this change). AUTOMATION_MODE is read from env
 * only (Fase 55): this endpoint never lets a caller force shadow/live.
 */
export async function POST(request: NextRequest) {
  const authError = checkIntegrationSecret(request);
  if (authError) return authError;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: { code: "DATABASE_NOT_CONFIGURED", message: "DATABASE_URL no está configurada." } },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "Cuerpo JSON inválido." } }, { status: 400 });
  }

  const parsed = IncomingLeadWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: { code: "INVALID_BODY", message: "Payload inválido.", issues: parsed.error.issues } },
      { status: 422 }
    );
  }
  const payload = parsed.data;

  const requestId =
    payload.requestId ||
    buildLeadFingerprint({
      phone: payload.telefono_cliente,
      interestType: payload.interes_cliente,
      propertyData: payload.datos_propiedad,
      origen: payload.origen,
    });

  const companyId = await getDefaultCompanyId();

  const { isDuplicateLead, webhookEventId } = await recordWebhookDelivery({
    provider: "manychat",
    externalId: payload.subscriber_id ? `${payload.subscriber_id}:${requestId}` : undefined,
    eventType: "lead",
    payload,
    requestId,
  });

  if (isDuplicateLead) {
    const existing = await findLeadByRequestId(requestId);
    await logAuditEvent({
      companyId,
      leadId: existing?.id,
      eventType: "LEAD_DUPLICATE_SKIPPED",
      status: "skipped",
      message: `Webhook repetido para requestId ${requestId}; no se creó un lead nuevo ni se repitieron llamadas externas.`,
    });
    await markWebhookEventProcessed(webhookEventId);
    return NextResponse.json({ ok: true, duplicate: true, leadId: existing?.id ?? null, status: existing?.status ?? null });
  }

  try {
    const result = await processIncomingLead(
      companyId,
      {
        nombre: payload.nombre,
        telefonoCliente: payload.telefono_cliente,
        interesCliente: payload.interes_cliente,
        datosPropiedad: payload.datos_propiedad,
        origen: payload.origen,
        subscriberId: payload.subscriber_id,
        requestId,
      },
      { source: "manychat_webhook", requestId }
    );
    await markWebhookEventProcessed(webhookEventId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await markWebhookEventProcessed(webhookEventId, message);
    return NextResponse.json({ ok: false, error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}
