/**
 * Reportes por propiedad: periodos, conteos y textos. Puro (sin BD ni red)
 * para probarlo. Los conteos SIEMPRE se calculan aquí/backend; la IA no
 * interviene en los números.
 *
 * Definiciones:
 * - Lead único por propiedad y periodo: contactos distintos (teléfono) que
 *   preguntaron por esa propiedad en el periodo. Cinco mensajes = uno.
 * - Un contacto interesado en dos propiedades cuenta una vez en cada una.
 * - Acumulado: contactos distintos en todo el histórico disponible hasta el
 *   fin del periodo (no la suma de semanas).
 * - Consultas (contacto-día) y mensajes son métricas separadas.
 * - Canal (WhatsApp) ≠ portal del enlace ≠ fuente de adquisición ≠ fuente
 *   declarada por el cliente. Sin evidencia: "No identificado".
 */
import { BRAND_NAME, OWNER_REPORT_BRAND } from "@/lib/brand";
import { PORTAL_LABELS } from "@/lib/conversation/property-reference";
import { MEXICO_CITY_TIME_ZONE, mexicoCityDateKey, mexicoCityWallTimeToUtc } from "@/lib/timezone";

// ---------------------------------------------------------------------------
// Periodo semanal del reporte (viernes a jueves, en America/Mexico_City)
// ---------------------------------------------------------------------------

export interface WeeklyPeriod {
  /** Inclusivo, 00:00 del primer día (UTC). */
  start: Date;
  /** Exclusivo: 00:00 del día de envío (UTC). */
  endExclusive: Date;
  startKey: string;
  /** Último día incluido (AAAA-MM-DD). */
  endKey: string;
  label: string;
}

function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function isoWeekday(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function keyToUtcStart(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return mexicoCityWallTimeToUtc(y, m, d, 0, 0);
}

const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });

export function formatDayKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return SHORT_DATE.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export function formatDayKeyNumeric(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Periodo completo que se reporta el día de envío (`weekday`, 5 = viernes)
 * de la semana que contiene `reference`: los 7 días anteriores al día de
 * envío (vie a jue). Periodos consecutivos, sin huecos ni solapamientos:
 * el fin exclusivo de uno es el inicio del siguiente.
 */
export function weeklyPeriodFor(reference: Date, weekday = 5): WeeklyPeriod {
  const todayKey = mexicoCityDateKey(reference);
  const back = (isoWeekday(todayKey) - weekday + 7) % 7;
  const sendKey = addDays(todayKey, -back);
  const startKey = addDays(sendKey, -7);
  const endKey = addDays(sendKey, -1);
  return {
    start: keyToUtcStart(startKey),
    endExclusive: keyToUtcStart(sendKey),
    startKey,
    endKey,
    label: `${formatDayKey(startKey)} al ${formatDayKey(endKey)}`,
  };
}

/** Periodo que termina justo antes de `period` (el anterior, contiguo). */
export function previousWeeklyPeriod(period: WeeklyPeriod, weekday = 5): WeeklyPeriod {
  // El inicio de un periodo es el día de envío del anterior.
  return weeklyPeriodFor(period.start, weekday);
}

/** ¿Ya toca enviar el reporte de esta semana? (día y hora locales configurados). */
export function isWeeklyDue(now: Date, schedule: { weekday: number; hour: number | null; minute: number }): boolean {
  if (schedule.hour == null) return false;
  const key = mexicoCityDateKey(now);
  if (isoWeekday(key) !== schedule.weekday) return false;
  const [y, m, d] = key.split("-").map(Number);
  return now.getTime() >= mexicoCityWallTimeToUtc(y, m, d, schedule.hour, schedule.minute).getTime();
}

// ---------------------------------------------------------------------------
// Conteos
// ---------------------------------------------------------------------------

export interface InquiryRow {
  publicId: string;
  contactKey: string;
  day: string;
  messageCount: number;
  channel: string;
  linkPortal: string | null;
  acquisitionSource: string | null;
  declaredSource: string | null;
  isTest: boolean;
  lastAt: Date;
}

export interface SourceCount {
  label: string;
  contacts: number;
}

export interface PropertyMetrics {
  publicId: string;
  periodLeads: number;
  cumulativeLeads: number;
  periodInquiries: number;
  periodMessages: number;
  lastInquiryAt: Date | null;
  channels: SourceCount[];
  linkPortals: SourceCount[];
  acquisition: SourceCount[];
  declared: SourceCount[];
}

export const NOT_IDENTIFIED = "No identificado";

function countDistinct(rows: InquiryRow[], labelOf: (row: InquiryRow) => string | null): SourceCount[] {
  const byLabel = new Map<string, Set<string>>();
  // Un contacto sin dato en ninguna de sus filas cuenta como "No identificado";
  // si alguna fila trae el dato, cuenta en ese valor.
  const byContact = new Map<string, Set<string>>();
  for (const row of rows) {
    const label = labelOf(row);
    const set = byContact.get(row.contactKey) ?? new Set<string>();
    if (label) set.add(label);
    byContact.set(row.contactKey, set);
  }
  for (const [contact, labels] of byContact) {
    for (const label of labels.size ? labels : new Set([NOT_IDENTIFIED])) {
      const set = byLabel.get(label) ?? new Set<string>();
      set.add(contact);
      byLabel.set(label, set);
    }
  }
  return [...byLabel.entries()]
    .map(([label, contacts]) => ({ label, contacts: contacts.size }))
    .sort((a, b) => (a.label === NOT_IDENTIFIED ? 1 : b.label === NOT_IDENTIFIED ? -1 : b.contacts - a.contacts));
}

export function channelLabel(channel: string): string {
  return channel === "whatsapp" ? "WhatsApp" : channel;
}

export function portalLabel(portal: string | null): string | null {
  return portal ? PORTAL_LABELS[portal] ?? portal : null;
}

/**
 * Métricas por propiedad para un periodo [startKey, endKey] (días
 * inclusivos). Excluye pruebas/simulaciones. El acumulado cuenta contactos
 * distintos hasta endKey.
 */
export function aggregatePropertyInquiries(rows: InquiryRow[], startKey: string, endKey: string): PropertyMetrics[] {
  const real = rows.filter((row) => !row.isTest && row.day <= endKey);
  const byProperty = new Map<string, InquiryRow[]>();
  for (const row of real) byProperty.set(row.publicId, [...(byProperty.get(row.publicId) ?? []), row]);
  const metrics: PropertyMetrics[] = [];
  for (const [publicId, all] of byProperty) {
    const inPeriod = all.filter((row) => row.day >= startKey);
    metrics.push({
      publicId,
      periodLeads: new Set(inPeriod.map((row) => row.contactKey)).size,
      cumulativeLeads: new Set(all.map((row) => row.contactKey)).size,
      periodInquiries: inPeriod.length,
      periodMessages: inPeriod.reduce((sum, row) => sum + row.messageCount, 0),
      lastInquiryAt: all.reduce<Date | null>((max, row) => (!max || row.lastAt > max ? row.lastAt : max), null),
      channels: countDistinct(inPeriod, (row) => channelLabel(row.channel)),
      linkPortals: countDistinct(inPeriod, (row) => portalLabel(row.linkPortal)),
      acquisition: countDistinct(inPeriod, (row) => row.acquisitionSource),
      declared: countDistinct(inPeriod, (row) => row.declaredSource),
    });
  }
  return metrics.sort((a, b) => b.periodLeads - a.periodLeads || b.cumulativeLeads - a.cumulativeLeads || a.publicId.localeCompare(b.publicId));
}

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

export type EventType = "SHOWING" | "OPEN_HOUSE" | "APPOINTMENT" | "OFFER" | "PRICE_UPDATE" | "MARKETING" | "OTHER";
export type EventStatus = "SCHEDULED" | "DONE" | "CANCELLED";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  SHOWING: "Visita",
  OPEN_HOUSE: "Open House",
  APPOINTMENT: "Cita",
  OFFER: "Oferta recibida",
  PRICE_UPDATE: "Actualización de precio",
  MARKETING: "Acción de promoción",
  OTHER: "Actividad",
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  SCHEDULED: "Programada",
  DONE: "Realizada",
  CANCELLED: "Cancelada",
};

export interface EventView {
  type: EventType;
  status: EventStatus;
  title: string;
  description: string | null;
  scheduledAt: Date | null;
  completedAt: Date | null;
  outcome: string | null;
  version: number;
}

const DATE_TIME = new Intl.DateTimeFormat("es-MX", {
  timeZone: MEXICO_CITY_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatEventDate(date: Date | null): string {
  return date ? DATE_TIME.format(date) : "fecha por confirmar";
}

function oneLine(text: string | null | undefined, max = 220): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Resumen de una actividad para el reporte: programada ≠ realizada; lo realizado usa solo lo registrado. */
export function describeEvent(event: EventView): string {
  const type = EVENT_TYPE_LABELS[event.type];
  if (event.status === "DONE") {
    const when = formatEventDate(event.completedAt ?? event.scheduledAt);
    return `${type} realizada (${when})${event.outcome ? `: ${oneLine(event.outcome, 160)}` : ""}`;
  }
  if (event.status === "CANCELLED") return `${type} cancelada (estaba para ${formatEventDate(event.scheduledAt)})`;
  return `${type} programada para ${formatEventDate(event.scheduledAt)}`;
}

// ---------------------------------------------------------------------------
// Textos para el propietario (sin datos personales de prospectos)
// ---------------------------------------------------------------------------

export interface OwnerWeeklyReport {
  /** Variables de la plantilla de WhatsApp: una línea cada una, sin saltos. */
  variables: { property: string; period: string; weekLeads: string; cumulative: string; sources: string; activity: string };
  text: string;
  metrics: { periodLeads: number; cumulativeLeads: number };
}

function sourcesText(metrics: PropertyMetrics | null): string {
  if (!metrics || metrics.periodLeads === 0) return "Sin personas interesadas en el periodo";
  const parts: string[] = [];
  const declared = metrics.declared.filter((s) => s.label !== NOT_IDENTIFIED);
  const portals = metrics.linkPortals.filter((s) => s.label !== NOT_IDENTIFIED);
  const acquisition = metrics.acquisition.filter((s) => s.label !== NOT_IDENTIFIED);
  if (acquisition.length) parts.push(`campaña: ${acquisition.map((s) => `${s.label} (${s.contacts})`).join(", ")}`);
  if (declared.length) parts.push(`dicho por el interesado: ${declared.map((s) => `${s.label} (${s.contacts})`).join(", ")}`);
  if (portals.length) parts.push(`enlace compartido de ${portals.map((s) => `${s.label} (${s.contacts})`).join(", ")}`);
  return parts.length ? `Contacto por WhatsApp; ${parts.join("; ")}` : `Contacto por WhatsApp; origen ${NOT_IDENTIFIED.toLowerCase()}`;
}

/**
 * Reporte semanal para el propietario. Solo métricas y actividad del
 * inmueble; nunca nombres ni teléfonos de prospectos. Si no hubo nada, lo dice.
 */
export function buildOwnerWeeklyReport(input: {
  property: { publicId: string; title: string | null };
  period: Pick<WeeklyPeriod, "label">;
  metrics: PropertyMetrics | null;
  dataSinceKey: string | null;
  events: EventView[];
}): OwnerWeeklyReport {
  const periodLeads = input.metrics?.periodLeads ?? 0;
  const cumulativeLeads = input.metrics?.cumulativeLeads ?? 0;
  const property = oneLine(`${input.property.title ?? "Propiedad"} (${input.property.publicId})`, 160);
  const weekLeads = periodLeads === 0 ? "Esta semana no se registraron personas interesadas" : `${periodLeads} ${periodLeads === 1 ? "persona interesada" : "personas interesadas"}`;
  const cumulative = `${cumulativeLeads} ${cumulativeLeads === 1 ? "persona" : "personas"}${input.dataSinceKey ? ` desde el ${formatDayKeyNumeric(input.dataSinceKey)}` : ""}`;
  const activity = input.events.length ? oneLine(input.events.map(describeEvent).join("; "), 600) : "Sin actividades registradas en el periodo";
  const variables = {
    property,
    period: input.period.label,
    weekLeads,
    cumulative,
    sources: oneLine(sourcesText(input.metrics), 400),
    activity,
  };
  const text = [
    `*${OWNER_REPORT_BRAND} | ${variables.property}*`,
    `Periodo: ${variables.period}`,
    `Interesados en la semana: ${variables.weekLeads}`,
    `Acumulado: ${variables.cumulative}`,
    `Procedencia: ${variables.sources}`,
    `Actividad: ${variables.activity}`,
    BRAND_NAME,
  ].join("\n");
  return { variables, text, metrics: { periodLeads, cumulativeLeads } };
}

export interface OwnerEventNotice {
  variables: { property: string; headline: string; detail: string };
  text: string;
}

/**
 * Aviso de actividad. Programada: fecha/hora y descripción. Realizada: solo
 * lo registrado (no inventa asistentes, resultados ni acuerdos).
 * Reprogramada/cancelada: la actualización correspondiente.
 */
export function buildOwnerEventNotice(input: { property: { publicId: string; title: string | null }; event: EventView }): OwnerEventNotice {
  const { event } = input;
  const type = EVENT_TYPE_LABELS[event.type];
  const property = oneLine(`${input.property.title ?? "Propiedad"} (${input.property.publicId})`, 160);
  let headline: string;
  let detail: string;
  if (event.status === "DONE") {
    headline = `${type} realizada el ${formatEventDate(event.completedAt ?? event.scheduledAt)}`;
    detail = event.outcome ? `Registro del equipo: ${oneLine(event.outcome, 500)}` : "El equipo registró la actividad como realizada.";
  } else if (event.status === "CANCELLED") {
    headline = `${type} cancelada`;
    detail = `Estaba programada para ${formatEventDate(event.scheduledAt)}.${event.description ? ` ${oneLine(event.description, 300)}` : ""}`;
  } else {
    headline = `${type} ${event.version > 1 ? "reprogramada" : "programada"} para ${formatEventDate(event.scheduledAt)}`;
    detail = oneLine(event.description || event.title, 500);
  }
  const text = [`*${OWNER_REPORT_BRAND} | ${property}*`, headline, detail, BRAND_NAME].filter(Boolean).join("\n");
  return { variables: { property, headline: oneLine(headline, 300), detail: oneLine(detail, 600) }, text };
}

// ---------------------------------------------------------------------------
// ¿Se le puede enviar a este destinatario?
// ---------------------------------------------------------------------------

export interface RecipientGate {
  active: boolean;
  consentStatus: "PENDING" | "GRANTED" | "REVOKED";
  verifiedAt: Date | null;
  manyChatSubscriberId: string | null;
  weeklyReport: boolean;
  eventNotifications: boolean;
}

/**
 * Nunca sale un mensaje a alguien sin destinatario verificado y
 * autorización registrada. `purpose` test ignora las casillas de
 * suscripción (prueba explícita), pero no la autorización.
 */
export function recipientBlockers(recipient: RecipientGate, purpose: "weekly" | "event" | "test"): string[] {
  const blockers: string[] = [];
  if (!recipient.active) blockers.push("destinatario desactivado");
  if (recipient.consentStatus !== "GRANTED") blockers.push("sin autorización registrada");
  if (!recipient.verifiedAt) blockers.push("sin verificar en ManyChat");
  if (!recipient.manyChatSubscriberId) blockers.push("sin contacto de ManyChat");
  if (purpose === "weekly" && !recipient.weeklyReport) blockers.push("reporte semanal no habilitado");
  if (purpose === "event" && !recipient.eventNotifications) blockers.push("avisos de actividad no habilitados");
  return blockers;
}
