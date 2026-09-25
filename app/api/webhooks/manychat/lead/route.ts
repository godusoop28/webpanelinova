import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { checkIntegrationSecret } from "@/lib/api-auth";
import { IncomingLeadWebhookSchema } from "@/lib/schemas";
import { isDatabaseConfigured } from "@/lib/db";
import { getDefaultCompanyId } from "@/lib/company";
import { buildLeadFingerprint, recordWebhookDelivery, markWebhookEventProcessed } from "@/lib/services/webhook.service";
import { processIncomingLead, DuplicatePhoneLeadError } from "@/lib/services/lead.service";
import { findLeadByRequestId, updateLead } from "@/lib/repositories/lead.repository";
import { logAuditEvent } from "@/lib/services/audit.service";
import { parseLenientJson } from "@/lib/lenient-json";

/**
 * One lead per phone per this many hours. A client who sends several
 * messages (or triggers several ManyChat timeouts) must reach one advisor,
 * not one advisor per message.
 */
const PHONE_DEDUP_WINDOW_HOURS = 24;

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

  // Not request.json(): ManyChat pastes {Last Text Input} into the body raw,
  // so a campaign message with a line break arrives as invalid JSON.
  const rawBody = await request.text();
  let body: unknown;
  try {
    body = parseLenientJson(rawBody);
  } catch {
    await logAuditEvent({
      companyId: await getDefaultCompanyId(),
      eventType: "WEBHOOK_REJECTED",
      status: "error",
      message: "Webhook de lead rechazado: cuerpo JSON inválido.",
      metadata: { rawBody: rawBody.slice(0, 2000) },
    });
    return NextResponse.json({ ok: false, error: { code: "INVALID_BODY", message: "Cuerpo JSON inválido." } }, { status: 400 });
  }

  const parsed = IncomingLeadWebhookSchema.safeParse(body);
  if (!parsed.success) {
    await logAuditEvent({
      companyId: await getDefaultCompanyId(),
      eventType: "WEBHOOK_REJECTED",
      status: "error",
      message: "Webhook de lead rechazado: payload inválido.",
      metadata: { issues: parsed.error.issues, rawBody: rawBody.slice(0, 2000) },
    });
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
      { source: "manychat_webhook", requestId, dedupeByPhoneHours: PHONE_DEDUP_WINDOW_HOURS }
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

    if (error instanceof DuplicatePhoneLeadError) {
      const existing = error.existing;
      await logAuditEvent({
        companyId,
        leadId: existing.id,
        eventType: "LEAD_DUPLICATE_SKIPPED",
        status: "skipped",
        message: `Mensaje adicional del mismo teléfono en menos de ${PHONE_DEDUP_WINDOW_HOURS} h; no se creó otro lead ni se notificó a otro asesor.`,
        metadata: {
          interesCliente: payload.interes_cliente,
          datosPropiedad: payload.datos_propiedad,
          origen: payload.origen,
          requestId,
        },
      });
      await markWebhookEventProcessed(webhookEventId);
      return NextResponse.json({ ok: true, duplicate: true, leadId: existing.id, status: existing.status });
    }

    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[WEBHOOK lead] pipeline falló", error);
    await markWebhookEventProcessed(webhookEventId, message);
    // A retry of this webhook is deduplicated (same requestId/phone), so a
    // lead left in PROCESSING would never move again. Mark it FAILED so it
    // shows up in the panel for manual reassignment instead of hiding.
    const stuck = await findLeadByRequestId(requestId).catch(() => null);
    if (stuck && (stuck.status === "PROCESSING" || stuck.status === "RECEIVED")) {
      await updateLead(stuck.id, { status: "FAILED" }).catch(() => undefined);
      await logAuditEvent({
        companyId,
        leadId: stuck.id,
        eventType: "LEAD_FAILED",
        status: "error",
        message: `El procesamiento del lead falló: ${message}`,
      });
    }
    return NextResponse.json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "No se pudo procesar el lead." } },
      { status: 500 }
    );
  }
}
