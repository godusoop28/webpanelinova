import "server-only";
import crypto from "node:crypto";
import { Prisma, type PropertyEvent, type PropertyRecipient, type PropertyReportDelivery, type PropertyReportSettings } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isLiveAutomation } from "@/lib/env";
import { normalizePhoneE164 } from "@/lib/phone";
import { mexicoCityDateKey, mexicoCityWallTimeToUtc } from "@/lib/timezone";
import {
  aggregatePropertyInquiries,
  buildOwnerEventNotice,
  buildOwnerWeeklyReport,
  isWeeklyDue,
  recipientBlockers,
  weeklyPeriodFor,
  type EventView,
  type InquiryRow,
  type PropertyMetrics,
  type WeeklyPeriod,
} from "@/lib/reporting/property-report";
import {
  findSubscriberByPhone,
  getSubscriberInfo,
  sendFlowOnce,
  setCustomFields,
  ManyChatApiError,
  ManyChatTimeoutError,
  type ManyChatCustomField,
} from "@/lib/services/manychat.service";
import { logAuditEvent } from "@/lib/services/audit.service";

/**
 * Reportes por propiedad, destinatarios (propietarios), actividades y
 * envíos. Todo filtrado por companyId; los permisos por rol se validan en
 * las Server Actions/páginas. Envíos reales solo con: función habilitada,
 * horario/flujo/campos configurados, destinatario verificado y autorizado,
 * y AUTOMATION_MODE=live.
 */

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface OwnerFieldIds {
  weekly: { property: number; period: number; weekLeads: number; cumulative: number; sources: number; activity: number } | null;
  event: { property: number; headline: number; detail: number } | null;
}

export async function getReportSettings(companyId: string): Promise<PropertyReportSettings> {
  const existing = await prisma.propertyReportSettings.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.propertyReportSettings.upsert({ where: { companyId }, create: { companyId }, update: {} });
}

export function ownerFieldIds(settings: Pick<PropertyReportSettings, "manyChatFieldIds">): OwnerFieldIds {
  const raw = (settings.manyChatFieldIds ?? {}) as Partial<OwnerFieldIds>;
  const numbers = (obj: unknown, keys: string[]) =>
    obj && typeof obj === "object" && keys.every((k) => Number.isInteger((obj as Record<string, unknown>)[k])) ? obj : null;
  return {
    weekly: numbers(raw.weekly, ["property", "period", "weekLeads", "cumulative", "sources", "activity"]) as OwnerFieldIds["weekly"],
    event: numbers(raw.event, ["property", "headline", "detail"]) as OwnerFieldIds["event"],
  };
}

export interface ReportSettingsUpdate {
  weeklyEnabled: boolean;
  weeklyHour: number | null;
  weeklyMinute: number;
  eventNotificationsEnabled: boolean;
  manyChatWeeklyFlowNs: string | null;
  manyChatEventFlowNs: string | null;
  manyChatFieldIds: OwnerFieldIds;
  templateNote: string | null;
}

/** Lo que falta para poder enviar (para mostrarlo en el panel y bloquear el envío). */
export function settingsBlockers(settings: PropertyReportSettings, purpose: "weekly" | "event" | "test"): string[] {
  const ids = ownerFieldIds(settings);
  const blockers: string[] = [];
  if (purpose === "weekly" && !settings.weeklyEnabled) blockers.push("reporte semanal deshabilitado");
  if (purpose === "weekly" && settings.weeklyHour == null) blockers.push("hora de envío sin confirmar");
  if (purpose === "event" && !settings.eventNotificationsEnabled) blockers.push("avisos de actividad deshabilitados");
  if (purpose !== "event" && (!settings.manyChatWeeklyFlowNs || !ids.weekly)) blockers.push("falta el flujo de ManyChat con la plantilla semanal aprobada y sus campos");
  if (purpose === "event" && (!settings.manyChatEventFlowNs || !ids.event)) blockers.push("falta el flujo de ManyChat con la plantilla de actividad aprobada y sus campos");
  if (!isLiveAutomation()) blockers.push("AUTOMATION_MODE no está en live");
  return blockers;
}

export async function updateReportSettings(companyId: string, update: ReportSettingsUpdate, by: string) {
  await getReportSettings(companyId);
  return prisma.propertyReportSettings.update({
    where: { companyId },
    data: { ...update, manyChatFieldIds: update.manyChatFieldIds as unknown as Prisma.InputJsonValue, updatedBy: by },
  });
}

// ---------------------------------------------------------------------------
// Lecturas para el panel
// ---------------------------------------------------------------------------

async function loadInquiryRows(companyId: string, endKey: string, publicId?: string): Promise<InquiryRow[]> {
  return prisma.propertyInquiry.findMany({
    where: { companyId, isTest: false, day: { lte: endKey }, ...(publicId ? { publicId } : {}) },
    select: {
      publicId: true,
      contactKey: true,
      day: true,
      messageCount: true,
      channel: true,
      linkPortal: true,
      acquisitionSource: true,
      declaredSource: true,
      isTest: true,
      lastAt: true,
    },
  });
}

/** Primer día con datos: los reportes no son el histórico completo de la empresa, solo desde aquí. */
export async function dataSinceKey(companyId: string): Promise<string | null> {
  const first = await prisma.propertyInquiry.findFirst({ where: { companyId, isTest: false }, orderBy: { day: "asc" }, select: { day: true } });
  return first?.day ?? null;
}

export interface PropertyReportRow extends PropertyMetrics {
  title: string | null;
  published: boolean | null;
  publicUrl: string | null;
  periodEvents: number;
  recipients: number;
  lastActivityAt: Date | null;
}

export async function listPropertyReport(input: { companyId: string; startKey: string; endKey: string; search?: string }): Promise<PropertyReportRow[]> {
  const rows = await loadInquiryRows(input.companyId, input.endKey);
  const metrics = aggregatePropertyInquiries(rows, input.startKey, input.endKey);
  const ids = metrics.map((m) => m.publicId);
  const [cache, events, recipients] = await Promise.all([
    prisma.propertyCacheEntry.findMany({ where: { companyId: input.companyId, publicId: { in: ids } }, select: { publicId: true, title: true, published: true, publicUrl: true } }),
    prisma.propertyEvent.groupBy({
      by: ["publicId"],
      where: { companyId: input.companyId, publicId: { in: ids }, OR: [{ scheduledAt: { gte: dayStart(input.startKey), lt: dayAfter(input.endKey) } }, { completedAt: { gte: dayStart(input.startKey), lt: dayAfter(input.endKey) } }] },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.propertyRecipient.groupBy({ by: ["publicId"], where: { companyId: input.companyId, active: true, publicId: { in: ids } }, _count: { _all: true } }),
  ]);
  const cacheById = new Map(cache.map((c) => [c.publicId, c]));
  const eventsById = new Map(events.map((e) => [e.publicId, e]));
  const recipientsById = new Map(recipients.map((r) => [r.publicId, r._count._all]));
  const search = input.search?.trim().toLowerCase();
  return metrics
    .map((m) => {
      const c = cacheById.get(m.publicId);
      const e = eventsById.get(m.publicId);
      const eventUpdated = e?._max.updatedAt ?? null;
      return {
        ...m,
        title: c?.title ?? null,
        published: c?.published ?? null,
        publicUrl: c?.publicUrl ?? null,
        periodEvents: e?._count._all ?? 0,
        recipients: recipientsById.get(m.publicId) ?? 0,
        lastActivityAt: [m.lastInquiryAt, eventUpdated].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      };
    })
    .filter((row) => !search || row.publicId.toLowerCase().includes(search) || (row.title ?? "").toLowerCase().includes(search));
}

/** 00:00 del día (AAAA-MM-DD) en Ciudad de México, como instante UTC. */
function dayStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return mexicoCityWallTimeToUtc(y, m, d, 0, 0);
}

function dayAfter(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return mexicoCityWallTimeToUtc(y, m, d + 1, 0, 0);
}

export function maskContact(contactKey: string): string {
  if (contactKey.startsWith("mc:")) return "Contacto de WhatsApp";
  const digits = contactKey.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

export async function getPropertyReportDetail(input: { companyId: string; publicId: string; startKey: string; endKey: string }) {
  const publicId = input.publicId.toUpperCase();
  const [rows, property, events, recipients, deliveries, inquiries, portalListings] = await Promise.all([
    loadInquiryRows(input.companyId, input.endKey, publicId),
    prisma.propertyCacheEntry.findUnique({ where: { companyId_publicId: { companyId: input.companyId, publicId } } }),
    prisma.propertyEvent.findMany({ where: { companyId: input.companyId, publicId }, orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }], take: 100 }),
    prisma.propertyRecipient.findMany({ where: { companyId: input.companyId, publicId }, orderBy: { createdAt: "asc" } }),
    prisma.propertyReportDelivery.findMany({
      where: { companyId: input.companyId, publicId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { recipient: { select: { name: true } } },
    }),
    prisma.propertyInquiry.findMany({
      where: { companyId: input.companyId, publicId, day: { gte: input.startKey, lte: input.endKey } },
      orderBy: { lastAt: "desc" },
      take: 200,
      include: { lead: { select: { id: true, assignedAdvisor: { select: { name: true } } } } },
    }),
    prisma.portalListing.findMany({ where: { companyId: input.companyId, publicId }, orderBy: { portal: "asc" } }),
  ]);
  const [metrics] = aggregatePropertyInquiries(rows, input.startKey, input.endKey);
  return { publicId, property, metrics: metrics ?? null, events, recipients, deliveries, inquiries, portalListings };
}

// ---------------------------------------------------------------------------
// Reporte semanal: vista previa y cola
// ---------------------------------------------------------------------------

function toEventView(event: PropertyEvent): EventView {
  return {
    type: event.type,
    status: event.status,
    title: event.title,
    description: event.description,
    scheduledAt: event.scheduledAt,
    completedAt: event.completedAt,
    outcome: event.outcome,
    version: event.version,
  };
}

export async function buildWeeklyReportFor(companyId: string, publicId: string, period: WeeklyPeriod) {
  const [rows, property, events, since] = await Promise.all([
    loadInquiryRows(companyId, period.endKey, publicId),
    prisma.propertyCacheEntry.findUnique({ where: { companyId_publicId: { companyId, publicId } }, select: { title: true } }),
    prisma.propertyEvent.findMany({
      where: {
        companyId,
        publicId,
        OR: [
          { scheduledAt: { gte: period.start, lt: period.endExclusive } },
          { completedAt: { gte: period.start, lt: period.endExclusive } },
          // Próximas actividades ya programadas también son relevantes para el propietario.
          { status: "SCHEDULED", scheduledAt: { gte: period.endExclusive, lt: new Date(period.endExclusive.getTime() + 14 * 86_400_000) } },
        ],
      },
      orderBy: { scheduledAt: "asc" },
    }),
    dataSinceKey(companyId),
  ]);
  const [metrics] = aggregatePropertyInquiries(rows, period.startKey, period.endKey);
  return buildOwnerWeeklyReport({
    property: { publicId, title: property?.title ?? null },
    period,
    metrics: metrics ?? null,
    dataSinceKey: since,
    events: events.map(toEventView),
  });
}

function weeklyFields(ids: NonNullable<OwnerFieldIds["weekly"]>, v: Awaited<ReturnType<typeof buildWeeklyReportFor>>["variables"]): ManyChatCustomField[] {
  return [
    { fieldId: ids.property, value: v.property },
    { fieldId: ids.period, value: v.period },
    { fieldId: ids.weekLeads, value: v.weekLeads },
    { fieldId: ids.cumulative, value: v.cumulative },
    { fieldId: ids.sources, value: v.sources },
    { fieldId: ids.activity, value: v.activity },
  ];
}

/**
 * Encola el reporte semanal de cada destinatario habilitado. Idempotente:
 * la clave weekly:<destinatario>:<propiedad>:<inicio> hace que ejecutar el
 * cron varias veces no duplique nada.
 */
export async function enqueueWeeklyReports(companyId: string, now = new Date()): Promise<{ period: WeeklyPeriod; created: number; skipped: number }> {
  const settings = await getReportSettings(companyId);
  const period = weeklyPeriodFor(now, settings.weeklyWeekday);
  const recipients = await prisma.propertyRecipient.findMany({ where: { companyId, active: true, weeklyReport: true } });
  let created = 0;
  let skipped = 0;
  for (const recipient of recipients) {
    if (recipientBlockers(recipient, "weekly").length > 0) {
      skipped += 1;
      continue;
    }
    const dedupeKey = `weekly:${recipient.id}:${recipient.publicId}:${period.startKey}`;
    if (await prisma.propertyReportDelivery.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
    const report = await buildWeeklyReportFor(companyId, recipient.publicId, period);
    try {
      await prisma.propertyReportDelivery.create({
        data: {
          companyId,
          recipientId: recipient.id,
          publicId: recipient.publicId,
          kind: "WEEKLY_REPORT",
          dedupeKey,
          periodStart: period.start,
          periodEnd: period.endExclusive,
          payload: { variables: report.variables, metrics: report.metrics, periodKey: period.startKey } as Prisma.InputJsonValue,
          text: report.text,
        },
      });
      created += 1;
    } catch (error) {
      // Otra ejecución simultánea ya lo creó (clave única): no se duplica.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
  }
  return { period, created, skipped };
}

// ---------------------------------------------------------------------------
// Envío
// ---------------------------------------------------------------------------

const RETRY_MINUTES = [5, 30, 120];
const MAX_ATTEMPTS = 3;

async function markRecipient(recipientId: string, status: string, error: string | null, sentAt?: Date) {
  await prisma.propertyRecipient.update({
    where: { id: recipientId },
    data: { lastSendStatus: status, lastError: error?.slice(0, 500) ?? null, ...(sentAt ? { lastSentAt: sentAt } : {}) },
  });
}

/**
 * Intenta un envío. Revalida todo en el momento de enviar (una
 * autorización revocada después de encolar gana). SENT solo si ManyChat
 * aceptó; timeout = UNCERTAIN (no se reenvía solo); error = reintento
 * acotado y luego FAILED.
 */
export async function attemptDelivery(delivery: PropertyReportDelivery): Promise<PropertyReportDelivery["status"]> {
  const [settings, recipient] = await Promise.all([
    getReportSettings(delivery.companyId),
    prisma.propertyRecipient.findUniqueOrThrow({ where: { id: delivery.recipientId } }),
  ]);
  const purpose = delivery.kind === "EVENT_NOTICE" ? "event" : delivery.kind === "TEST" ? "test" : "weekly";
  const blockers = [...recipientBlockers(recipient, purpose), ...settingsBlockers(settings, purpose)];
  if (blockers.length > 0) {
    const reason = `No enviado: ${blockers.join("; ")}.`;
    await prisma.propertyReportDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: reason } });
    await markRecipient(recipient.id, "SKIPPED", reason);
    return "SKIPPED";
  }

  const claimed = await prisma.propertyReportDelivery.updateMany({
    where: { id: delivery.id, status: "PENDING" },
    data: { status: "SENDING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return delivery.status;

  const ids = ownerFieldIds(settings);
  const payload = delivery.payload as { variables: Record<string, string> };
  const flowNs = purpose === "event" ? settings.manyChatEventFlowNs! : settings.manyChatWeeklyFlowNs!;
  const fields: ManyChatCustomField[] =
    purpose === "event"
      ? [
          { fieldId: ids.event!.property, value: payload.variables.property },
          { fieldId: ids.event!.headline, value: payload.variables.headline },
          { fieldId: ids.event!.detail, value: payload.variables.detail },
        ]
      : weeklyFields(ids.weekly!, payload.variables as Parameters<typeof weeklyFields>[1]);

  try {
    // Los campos del contacto se sobrescriben con ESTE reporte antes de lanzar el flujo.
    await setCustomFields(recipient.manyChatSubscriberId!, fields);
    await sendFlowOnce(recipient.manyChatSubscriberId!, flowNs);
    const sentAt = new Date();
    await prisma.propertyReportDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt, lastError: null } });
    await markRecipient(recipient.id, "SENT", null, sentAt);
    await logAuditEvent({ companyId: delivery.companyId, eventType: "OWNER_REPORT_SENT", status: "ok", message: `${delivery.kind} ${delivery.publicId} enviado a destinatario ${recipient.id}.` });
    return "SENT";
  } catch (error) {
    if (error instanceof ManyChatTimeoutError) {
      const reason = "Timeout de ManyChat: el mensaje pudo haberse entregado. Revisar antes de reenviar.";
      await prisma.propertyReportDelivery.update({ where: { id: delivery.id }, data: { status: "UNCERTAIN", lastError: reason } });
      await markRecipient(recipient.id, "UNCERTAIN", reason);
      return "UNCERTAIN";
    }
    const attempts = delivery.attempts + 1;
    const detail = error instanceof ManyChatApiError ? `${error.message} ${JSON.stringify(error.body).slice(0, 300)}` : error instanceof Error ? error.message : "Error desconocido";
    const final = attempts >= MAX_ATTEMPTS || (error instanceof ManyChatApiError && error.status >= 400 && error.status < 500 && error.status !== 429);
    await prisma.propertyReportDelivery.update({
      where: { id: delivery.id },
      data: {
        status: final ? "FAILED" : "PENDING",
        lastError: detail.slice(0, 1000),
        nextAttemptAt: new Date(Date.now() + RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)] * 60_000),
      },
    });
    await markRecipient(recipient.id, final ? "FAILED" : "PENDING", detail);
    return final ? "FAILED" : "PENDING";
  }
}

export async function processDueDeliveries(limit = 20, deadline = Date.now() + 50_000): Promise<Record<string, number>> {
  const due = await prisma.propertyReportDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });
  const summary: Record<string, number> = {};
  for (const delivery of due) {
    if (Date.now() + 8_000 > deadline) break;
    const status = await attemptDelivery(delivery);
    summary[status] = (summary[status] ?? 0) + 1;
  }
  // Un proceso que murió entre SENDING y el resultado: incierto, nunca reenviado solo.
  await prisma.propertyReportDelivery.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    data: { status: "UNCERTAIN", lastError: "El proceso se interrumpió durante el envío; pudo haberse entregado." },
  });
  return summary;
}

/** Cron: encola el reporte del viernes cuando ya toca (hora configurada, CDMX) y procesa la cola. */
export async function runPropertyReportsCron(companyId: string, now = new Date()) {
  const settings = await getReportSettings(companyId);
  let weekly: { periodKey: string; created: number; skipped: number } | null = null;
  if (settings.weeklyEnabled && isWeeklyDue(now, { weekday: settings.weeklyWeekday, hour: settings.weeklyHour, minute: settings.weeklyMinute })) {
    const result = await enqueueWeeklyReports(companyId, now);
    weekly = { periodKey: result.period.startKey, created: result.created, skipped: result.skipped };
  }
  const deliveries = await processDueDeliveries();
  return { weekly, deliveries };
}

/** Prueba a UN destinatario autorizado (ADMIN). Mismos candados de autorización/verificación. */
export async function sendTestReport(input: { companyId: string; recipientId: string; by: string; now?: Date }) {
  const recipient = await prisma.propertyRecipient.findFirst({ where: { id: input.recipientId, companyId: input.companyId } });
  if (!recipient) throw new Error("Destinatario no encontrado.");
  const blockers = recipientBlockers(recipient, "test");
  if (blockers.length) throw new Error(`No se puede enviar la prueba: ${blockers.join("; ")}.`);
  const settings = await getReportSettings(input.companyId);
  const settingsIssues = settingsBlockers(settings, "test");
  if (settingsIssues.length) throw new Error(`No se puede enviar la prueba: ${settingsIssues.join("; ")}.`);
  const period = weeklyPeriodFor(input.now ?? new Date(), settings.weeklyWeekday);
  const report = await buildWeeklyReportFor(input.companyId, recipient.publicId, period);
  const delivery = await prisma.propertyReportDelivery.create({
    data: {
      companyId: input.companyId,
      recipientId: recipient.id,
      publicId: recipient.publicId,
      kind: "TEST",
      dedupeKey: `test:${crypto.randomUUID()}`,
      periodStart: period.start,
      periodEnd: period.endExclusive,
      payload: { variables: report.variables, metrics: report.metrics, periodKey: period.startKey } as Prisma.InputJsonValue,
      text: report.text,
      createdBy: input.by,
    },
  });
  return attemptDelivery(delivery);
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------

export const RECIPIENT_RELATIONS = ["propietario", "copropietario", "representante", "administrador", "otro"] as const;

export interface RecipientInput {
  publicId: string;
  name: string;
  phone: string;
  relation: string;
  weeklyReport: boolean;
  eventNotifications: boolean;
  manyChatSubscriberId: string | null;
  notes: string | null;
  /** El equipo confirma que NO es un prospecto de esta u otra propiedad. */
  confirmNotProspect: boolean;
}

/** ¿Este teléfono aparece como prospecto (lead o consulta)? Nunca se reutiliza en silencio. */
export async function phoneIsProspect(companyId: string, phoneE164: string): Promise<boolean> {
  const [lead, inquiry] = await Promise.all([
    prisma.lead.findFirst({ where: { companyId, phone: phoneE164 }, select: { id: true } }),
    prisma.propertyInquiry.findFirst({ where: { companyId, contactKey: phoneE164 }, select: { id: true } }),
  ]);
  return Boolean(lead || inquiry);
}

export async function createRecipient(companyId: string, input: RecipientInput, by: string): Promise<PropertyRecipient> {
  const phoneE164 = normalizePhoneE164(input.phone);
  if (!phoneE164) throw new Error("Teléfono inválido: usa 10 dígitos o formato internacional.");
  if (!input.confirmNotProspect && (await phoneIsProspect(companyId, phoneE164))) {
    throw new Error("Ese teléfono aparece como prospecto (lead o consulta). Confirma explícitamente que es el propietario/destinatario antes de guardarlo.");
  }
  try {
    return await prisma.propertyRecipient.create({
      data: {
        companyId,
        publicId: input.publicId.toUpperCase(),
        name: input.name.trim().slice(0, 120),
        phoneE164,
        relation: input.relation,
        // Las casillas de envío quedan apagadas hasta registrar la autorización y verificar.
        weeklyReport: false,
        eventNotifications: false,
        manyChatSubscriberId: input.manyChatSubscriberId,
        notes: input.notes?.slice(0, 500) ?? null,
        createdBy: by,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new Error("Ese teléfono ya está registrado para esta propiedad.");
    throw error;
  }
}

export async function updateRecipient(
  companyId: string,
  recipientId: string,
  data: { weeklyReport?: boolean; eventNotifications?: boolean; active?: boolean; relation?: string; name?: string; manyChatSubscriberId?: string | null; notes?: string | null },
  by: string
) {
  const recipient = await prisma.propertyRecipient.findFirst({ where: { id: recipientId, companyId } });
  if (!recipient) throw new Error("Destinatario no encontrado.");
  const enabling = (data.weeklyReport && !recipient.weeklyReport) || (data.eventNotifications && !recipient.eventNotifications);
  if (enabling && (recipient.consentStatus !== "GRANTED" || !recipient.verifiedAt)) {
    throw new Error("Primero registra la autorización del destinatario y verifica su contacto de ManyChat.");
  }
  const subscriberChanged = data.manyChatSubscriberId !== undefined && data.manyChatSubscriberId !== recipient.manyChatSubscriberId;
  await prisma.propertyRecipient.update({
    where: { id: recipientId },
    data: {
      ...data,
      // Cambiar el contacto de ManyChat obliga a verificar de nuevo.
      ...(subscriberChanged ? { verifiedAt: null, verifiedBy: null, verificationNote: `Contacto de ManyChat cambiado por ${by}; verificar de nuevo.` } : {}),
    },
  });
}

export async function recordRecipientConsent(companyId: string, recipientId: string, input: { granted: boolean; evidence: string }, by: string) {
  const recipient = await prisma.propertyRecipient.findFirst({ where: { id: recipientId, companyId } });
  if (!recipient) throw new Error("Destinatario no encontrado.");
  if (input.granted && input.evidence.trim().length < 10) throw new Error("Describe cómo y cuándo autorizó (mínimo 10 caracteres).");
  await prisma.propertyRecipient.update({
    where: { id: recipientId },
    data: input.granted
      ? { consentStatus: "GRANTED", consentEvidence: input.evidence.trim().slice(0, 1000), consentAt: new Date(), consentRecordedBy: by }
      : { consentStatus: "REVOKED", consentEvidence: `${recipient.consentEvidence ?? ""}\nRevocada por ${by}: ${input.evidence}`.trim().slice(0, 1000), weeklyReport: false, eventNotifications: false },
  });
}

/**
 * Comprueba en ManyChat que el contacto corresponde al teléfono del
 * destinatario (getInfo por subscriber, o búsqueda por teléfono si no se
 * capturó el subscriber). Solo lectura en ManyChat.
 */
export async function verifyRecipient(companyId: string, recipientId: string, by: string): Promise<{ ok: boolean; note: string }> {
  const recipient = await prisma.propertyRecipient.findFirst({ where: { id: recipientId, companyId } });
  if (!recipient) throw new Error("Destinatario no encontrado.");
  let note: string;
  let subscriberId = recipient.manyChatSubscriberId;
  let ok = false;
  try {
    const info = subscriberId ? await getSubscriberInfo(subscriberId) : await findSubscriberByPhone(recipient.phoneE164);
    if (!info) {
      note = subscriberId ? "ManyChat no encontró ese contacto." : "No hay un contacto de ManyChat con ese teléfono. El destinatario debe escribir primero al WhatsApp de la inmobiliaria.";
    } else {
      subscriberId = String(info.id);
      const phones = [info.whatsapp_phone, info.phone].map((p) => normalizePhoneE164(p ?? "")).filter(Boolean);
      ok = phones.includes(recipient.phoneE164);
      note = ok
        ? `Verificado: el contacto ${subscriberId} de ManyChat tiene el teléfono ${recipient.phoneE164}.`
        : `El contacto ${subscriberId} de ManyChat tiene otro teléfono; no se verificó.`;
    }
  } catch (error) {
    note = `No se pudo consultar ManyChat: ${error instanceof Error ? error.message : "error desconocido"}.`;
  }
  await prisma.propertyRecipient.update({
    where: { id: recipientId },
    data: ok
      ? { manyChatSubscriberId: subscriberId, verifiedAt: new Date(), verifiedBy: by, verificationNote: note }
      : { verifiedAt: null, verificationNote: note },
  });
  return { ok, note };
}

// ---------------------------------------------------------------------------
// Actividades (registro en el panel) y avisos
// ---------------------------------------------------------------------------

export interface EventInput {
  publicId: string;
  type: PropertyEvent["type"];
  status: PropertyEvent["status"];
  title: string;
  description: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  outcome: string | null;
  notifyRecipients: boolean;
}

function validateEvent(input: EventInput) {
  if (input.status === "SCHEDULED" && !input.scheduledAt) throw new Error("Una actividad programada necesita fecha y hora.");
  if (input.status === "DONE" && !input.completedAt && !input.scheduledAt) throw new Error("Indica cuándo se realizó.");
  if (input.status !== "DONE" && input.outcome) throw new Error("El resumen de lo realizado solo aplica a actividades realizadas.");
}

export async function createPropertyEvent(companyId: string, input: EventInput, by: string) {
  validateEvent(input);
  const event = await prisma.propertyEvent.create({
    data: { companyId, ...input, publicId: input.publicId.toUpperCase(), origin: "panel", createdBy: by, updatedBy: by },
  });
  const notices = await enqueueEventNotices(event);
  return { event, notices };
}

/** Sube la versión solo con cambios relevantes (estado, fecha, resumen): una notificación por versión. */
export async function updatePropertyEvent(companyId: string, eventId: string, input: EventInput, by: string) {
  validateEvent(input);
  const current = await prisma.propertyEvent.findFirst({ where: { id: eventId, companyId } });
  if (!current) throw new Error("Actividad no encontrada.");
  const relevant =
    current.status !== input.status ||
    (current.scheduledAt?.getTime() ?? null) !== (input.scheduledAt?.getTime() ?? null) ||
    (current.completedAt?.getTime() ?? null) !== (input.completedAt?.getTime() ?? null) ||
    (current.outcome ?? null) !== (input.outcome ?? null);
  const event = await prisma.propertyEvent.update({
    where: { id: eventId },
    data: {
      type: input.type,
      status: input.status,
      title: input.title,
      description: input.description,
      scheduledAt: input.scheduledAt,
      completedAt: input.completedAt,
      outcome: input.outcome,
      notifyRecipients: input.notifyRecipients,
      updatedBy: by,
      ...(relevant ? { version: { increment: 1 } } : {}),
    },
  });
  const notices = relevant ? await enqueueEventNotices(event) : 0;
  return { event, notices };
}

/**
 * Encola avisos de una versión del evento para los destinatarios
 * habilitados. Clave event:<id>:v<versión>:<destinatario>: importar o
 * guardar dos veces lo mismo no duplica. Sin función habilitada no encola.
 */
export async function enqueueEventNotices(event: PropertyEvent): Promise<number> {
  if (!event.notifyRecipients) return 0;
  const settings = await getReportSettings(event.companyId);
  if (!settings.eventNotificationsEnabled) return 0;
  const recipients = await prisma.propertyRecipient.findMany({ where: { companyId: event.companyId, publicId: event.publicId, active: true, eventNotifications: true } });
  const property = await prisma.propertyCacheEntry.findUnique({ where: { companyId_publicId: { companyId: event.companyId, publicId: event.publicId } }, select: { title: true } });
  const notice = buildOwnerEventNotice({ property: { publicId: event.publicId, title: property?.title ?? null }, event: toEventView(event) });
  let created = 0;
  for (const recipient of recipients) {
    if (recipientBlockers(recipient, "event").length) continue;
    const result = await prisma.propertyReportDelivery.createMany({
      data: [
        {
          companyId: event.companyId,
          recipientId: recipient.id,
          publicId: event.publicId,
          kind: "EVENT_NOTICE",
          dedupeKey: `event:${event.id}:v${event.version}:${recipient.id}`,
          eventId: event.id,
          payload: { variables: notice.variables, eventVersion: event.version } as Prisma.InputJsonValue,
          text: notice.text,
        },
      ],
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
}

export function mexicoDayKey(date: Date): string {
  return mexicoCityDateKey(date);
}
