import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { IncomingLeadWebhookSchema } from "@/lib/schemas";
import { isDatabaseConfigured } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { buildLeadFingerprint, recordWebhookDelivery, markWebhookEventProcessed } from "@/lib/services/webhook.service";
import { processIncomingLead } from "@/lib/services/lead.service";
import { findLeadByRequestId } from "@/lib/repositories/lead.repository";
import { logAuditEvent } from "@/lib/services/audit.service";

/**
 * Real-time lead intake from ManyChat. Accepts nombre, telefono_cliente,
 * interes_cliente, datos_propiedad, origen, and either subscriber_id /
 * manychat_subscriber_id, requestId / request_id, and titulo_propiedad /
 * url_propiedad (all optional — unknown extra fields are stripped, not
 * rejected). AUTOMATION_MODE is read from env only: this endpoint never
 * lets a caller force shadow/live.
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
  const subscriberId = payload.subscriber_id || payload.manychat_subscriber_id;

  const requestId =
    payload.requestId ||
    payload.request_id ||
    buildLeadFingerprint({
      phone: payload.telefono_cliente,
      interestType: payload.interes_cliente,
      propertyData: payload.datos_propiedad,
      origen: payload.origen,
    });

  const companyId = await getDefaultCompanyId();

  const { isDuplicateLead, webhookEventId } = await recordWebhookDelivery({
    provider: "manychat",
    externalId: subscriberId ? `${subscriberId}:${requestId}` : undefined,
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
        subscriberId,
        requestId,
        tituloPropiedad: payload.titulo_propiedad,
        urlPropiedad: payload.url_propiedad,
      },
      { source: "manychat_webhook", requestId }
    );
    await markWebhookEventProcessed(webhookEventId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    // Two webhook deliveries for the same requestId arriving concurrently
    // both pass the isDuplicateLead pre-check above before either has
    // written its Lead row — the loser hits Lead.requestId's unique
    // constraint here instead. Treat it the same as the pre-check duplicate
    // path rather than a real failure: no second Lead/assignment/EasyBroker
    // call ever happens, so ManyChat should see "duplicate", not a 500.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      (error.meta?.target as string[] | undefined)?.includes("requestId")
    ) {
      const existing = await findLeadByRequestId(requestId);
      await logAuditEvent({
        companyId,
        leadId: existing?.id,
        eventType: "LEAD_DUPLICATE_SKIPPED",
        status: "skipped",
        message: `Webhook concurrente para requestId ${requestId}; ya existía un lead con este requestId.`,
      });
      await markWebhookEventProcessed(webhookEventId);
      return NextResponse.json({ ok: true, duplicate: true, leadId: existing?.id ?? null, status: existing?.status ?? null });
    }

    const message = error instanceof Error ? error.message : "Error desconocido";
    await markWebhookEventProcessed(webhookEventId, message);
    return NextResponse.json({ ok: false, error: { code: "INTERNAL_ERROR", message } }, { status: 500 });
  }
}
