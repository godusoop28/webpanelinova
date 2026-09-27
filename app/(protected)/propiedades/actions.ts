"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/dal";
import { getDefaultCompanyId } from "@/lib/company";
import { mexicoCityWallTimeToUtc } from "@/lib/timezone";
import {
  RECIPIENT_RELATIONS,
  createPropertyEvent,
  createRecipient,
  recordRecipientConsent,
  sendTestReport,
  updatePropertyEvent,
  updateRecipient,
  updateReportSettings,
  verifyRecipient,
} from "@/lib/services/property-report.service";

export interface PropertyActionState {
  error?: string;
  success?: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

function detailPath(publicId: string) {
  return `/propiedades/${encodeURIComponent(publicId.toUpperCase())}`;
}

const PUBLIC_ID = z.string().trim().regex(/^EB-[A-Z]{2}\d{3,6}$/i, "Código de propiedad inválido.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .default(null);

/** "2026-09-27T11:00" capturado en el panel = hora de Ciudad de México. */
function parseLocalDateTime(value: string | null): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Fecha y hora inválidas.");
  const [, y, m, d, h, min] = match.map(Number);
  return mexicoCityWallTimeToUtc(y, m, d, h, min);
}

// ---------------------------------------------------------------------------
// Destinatarios
// ---------------------------------------------------------------------------

const RecipientSchema = z.object({
  publicId: PUBLIC_ID,
  name: z.string().trim().min(2, "Indica el nombre.").max(120),
  phone: z.string().trim().min(8, "Indica el WhatsApp."),
  relation: z.enum(RECIPIENT_RELATIONS),
  manyChatSubscriberId: z
    .string()
    .trim()
    .regex(/^\d{0,20}$/, "El ID de ManyChat son solo dígitos.")
    .transform((v) => v || null),
  notes: optionalText(500),
});

export async function createRecipientAction(_prev: PropertyActionState, formData: FormData): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const parsed = RecipientSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    await createRecipient(
      await getDefaultCompanyId(),
      { ...parsed.data, weeklyReport: false, eventNotifications: false, confirmNotProspect: formData.get("confirmNotProspect") === "on" },
      user.email
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(detailPath(parsed.data.publicId));
  return { success: "Destinatario agregado. Registra su autorización y verifícalo antes de habilitar envíos." };
}

export async function recordConsentAction(recipientId: string, publicId: string, _prev: PropertyActionState, formData: FormData): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  const granted = formData.get("decision") !== "revoke";
  try {
    await recordRecipientConsent(await getDefaultCompanyId(), recipientId, { granted, evidence: String(formData.get("evidence") ?? "") }, user.email);
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(detailPath(publicId));
  return { success: granted ? "Autorización registrada." : "Autorización revocada; envíos desactivados." };
}

export async function verifyRecipientAction(recipientId: string, publicId: string): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  try {
    const result = await verifyRecipient(await getDefaultCompanyId(), recipientId, user.email);
    revalidatePath(detailPath(publicId));
    return result.ok ? { success: result.note } : { error: result.note };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function updateRecipientFlagsAction(recipientId: string, publicId: string, _prev: PropertyActionState, formData: FormData): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  try {
    await updateRecipient(
      await getDefaultCompanyId(),
      recipientId,
      {
        weeklyReport: formData.get("weeklyReport") === "on",
        eventNotifications: formData.get("eventNotifications") === "on",
        active: formData.get("active") === "on",
      },
      user.email
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(detailPath(publicId));
  return { success: "Preferencias guardadas." };
}

export async function sendTestReportAction(recipientId: string, publicId: string): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN");
  try {
    const status = await sendTestReport({ companyId: await getDefaultCompanyId(), recipientId, by: user.email });
    revalidatePath(detailPath(publicId));
    return status === "SENT" ? { success: "Prueba enviada (ManyChat la aceptó)." } : { error: `La prueba quedó como ${status}. Revisa el historial de envíos.` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Actividades
// ---------------------------------------------------------------------------

const EventSchema = z.object({
  publicId: PUBLIC_ID,
  type: z.enum(["SHOWING", "OPEN_HOUSE", "APPOINTMENT", "OFFER", "PRICE_UPDATE", "MARKETING", "OTHER"]),
  status: z.enum(["SCHEDULED", "DONE", "CANCELLED"]),
  title: z.string().trim().min(3, "Indica un título.").max(160),
  description: optionalText(1000),
  scheduledAt: optionalText(20),
  completedAt: optionalText(20),
  outcome: optionalText(1500),
});

function eventInput(formData: FormData) {
  const parsed = EventSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  return {
    ...parsed.data,
    publicId: parsed.data.publicId.toUpperCase(),
    scheduledAt: parseLocalDateTime(parsed.data.scheduledAt),
    completedAt: parseLocalDateTime(parsed.data.completedAt),
    outcome: parsed.data.status === "DONE" ? parsed.data.outcome : null,
    notifyRecipients: formData.get("notifyRecipients") === "on",
  };
}

export async function saveEventAction(eventId: string | null, _prev: PropertyActionState, formData: FormData): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN", "DIRECCION");
  let publicId = "";
  try {
    const input = eventInput(formData);
    publicId = input.publicId;
    const companyId = await getDefaultCompanyId();
    const result = eventId ? await updatePropertyEvent(companyId, eventId, input, user.email) : await createPropertyEvent(companyId, input, user.email);
    revalidatePath(detailPath(publicId));
    return { success: result.notices > 0 ? `Actividad guardada; ${result.notices} aviso(s) en cola.` : "Actividad guardada (sin avisos en cola)." };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Configuración (solo ADMIN)
// ---------------------------------------------------------------------------

const fieldId = z.coerce.number().int().positive();
const SettingsSchema = z.object({
  weeklyHour: z.string().trim().transform((v) => (v === "" ? null : Number(v))).pipe(z.number().int().min(0).max(23).nullable()),
  weeklyMinute: z.coerce.number().int().min(0).max(59).default(0),
  manyChatWeeklyFlowNs: z.string().trim().max(80).transform((v) => v || null),
  manyChatEventFlowNs: z.string().trim().max(80).transform((v) => v || null),
  templateNote: z.string().trim().max(500).transform((v) => v || null),
});

function optionalFieldIds<T extends string>(formData: FormData, prefix: string, keys: readonly T[]): Record<T, number> | null {
  const values = keys.map((key) => String(formData.get(`${prefix}.${key}`) ?? "").trim());
  if (values.every((v) => v === "")) return null;
  const parsed = keys.map((key, i) => [key, fieldId.safeParse(values[i])] as const);
  const invalid = parsed.find(([, r]) => !r.success);
  if (invalid) throw new Error(`Campo de ManyChat inválido: ${prefix}.${invalid[0]} (ID numérico).`);
  return Object.fromEntries(parsed.map(([key, r]) => [key, (r as { data: number }).data])) as Record<T, number>;
}

export async function saveReportSettingsAction(_prev: PropertyActionState, formData: FormData): Promise<PropertyActionState> {
  const user = await requireRole("ADMIN");
  const parsed = SettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  try {
    const weekly = optionalFieldIds(formData, "weekly", ["property", "period", "weekLeads", "cumulative", "sources", "activity"] as const);
    const event = optionalFieldIds(formData, "event", ["property", "headline", "detail"] as const);
    const weeklyEnabled = formData.get("weeklyEnabled") === "on";
    const eventNotificationsEnabled = formData.get("eventNotificationsEnabled") === "on";
    if (weeklyEnabled && (parsed.data.weeklyHour == null || !parsed.data.manyChatWeeklyFlowNs || !weekly)) {
      return { error: "Para habilitar el reporte semanal se necesitan la hora confirmada, el flujo con la plantilla aprobada y los campos." };
    }
    if (eventNotificationsEnabled && (!parsed.data.manyChatEventFlowNs || !event)) {
      return { error: "Para habilitar los avisos de actividad se necesitan el flujo con la plantilla aprobada y los campos." };
    }
    await updateReportSettings(
      await getDefaultCompanyId(),
      { ...parsed.data, weeklyEnabled, eventNotificationsEnabled, manyChatFieldIds: { weekly, event } },
      user.email
    );
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath("/propiedades/configuracion");
  return { success: "Configuración guardada." };
}
