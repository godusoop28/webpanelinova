import { z } from "zod";
import { LEAD_ROUTES } from "@/lib/advisors";

export const RoleSchema = z.enum(["ADMIN", "DIRECCION", "CONSULTA"]);

// ---------------------------------------------------------------------------
// Asesores
// ---------------------------------------------------------------------------

/**
 * Shared by create and update: both forms collect the same fields. `activo`
 * is handled separately by the toggle action, and `pausadoHasta` by the
 * pause/resume actions, so neither is part of this schema.
 */
export const AdvisorInputSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  whatsapp: z
    .string()
    .trim()
    .min(8, "El WhatsApp debe incluir lada y número.")
    .transform((value) => value.replace(/\s+/g, "")),
  emailEasyBroker: z.union([
    z.literal(""),
    z.string().trim().toLowerCase().email("Correo inválido."),
  ]),
  manyChatId: z.string().trim().default(""),
  activo: z.boolean(),
  peso: z.coerce.number().int("El peso debe ser un número entero.").positive("El peso debe ser mayor a 0."),
  rutasPermitidas: z.array(z.enum(LEAD_ROUTES)).default([]),
  limiteDiario: z
    .union([z.coerce.number().int().positive(), z.null()])
    .default(null),
  observaciones: z.string().trim().max(500, "Máximo 500 caracteres.").default(""),
});

export type AdvisorInput = z.infer<typeof AdvisorInputSchema>;

export const PauseAdvisorInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("1h") }),
  z.object({ mode: z.literal("tomorrow_9am") }),
  z.object({ mode: z.literal("indefinite") }),
  z.object({
    mode: z.literal("custom"),
    // datetime-local value, e.g. "2026-09-04T09:00", interpreted as America/Mexico_City.
    customDateTime: z.string().trim().min(1, "Selecciona fecha y hora."),
  }),
]);

export type PauseAdvisorInput = z.infer<typeof PauseAdvisorInputSchema>;

export const SimulateDistributionInputSchema = z.object({
  route: z.enum(LEAD_ROUTES),
  iterations: z.coerce.number().int().min(1).max(1000),
});

// ---------------------------------------------------------------------------
// Usuarios del panel
// ---------------------------------------------------------------------------

export const CreateUserInputSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  correo: z.string().trim().toLowerCase().email("Correo inválido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  rol: RoleSchema,
  activo: z.boolean(),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  correo: z.string().trim().toLowerCase().email("Correo inválido."),
  rol: RoleSchema,
  activo: z.boolean(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

export const ResetPasswordInputSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
});

// ---------------------------------------------------------------------------
// Webhooks de ManyChat — nombres de campo compatibles con el payload que
// ManyChat ya envía hoy, para minimizar cambios en su flow.
// ---------------------------------------------------------------------------

export const IncomingLeadWebhookSchema = z.object({
  nombre: z.string().trim().min(1, "nombre es obligatorio."),
  telefono_cliente: z.string().trim().min(1, "telefono_cliente es obligatorio."),
  interes_cliente: z.string().trim().min(1, "interes_cliente es obligatorio."),
  datos_propiedad: z.string().trim().optional().default(""),
  origen: z.string().trim().optional().default(""),
  subscriber_id: z.string().trim().optional(),
  manychat_subscriber_id: z.string().trim().optional(),
  request_id: z.string().trim().optional(),
  requestId: z.string().trim().optional(),
  titulo_propiedad: z.string().trim().optional(),
  url_propiedad: z.string().trim().optional(),
});

export type IncomingLeadWebhookPayload = z.infer<typeof IncomingLeadWebhookSchema>;

export const PropertySearchWebhookSchema = z.object({
  busqueda_propiedad: z.string().trim().min(1, "busqueda_propiedad es obligatoria."),
});

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export const LeadStatusSchema = z.enum([
  "RECEIVED",
  "PROCESSING",
  "CREATED_IN_EASYBROKER",
  "ASSIGNED",
  "NOTIFIED",
  "COMPLETED",
  "FAILED",
]);

export const UpdateLeadInputSchema = z.object({
  status: LeadStatusSchema.optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export const ReassignLeadInputSchema = z.object({
  advisorId: z.string().trim().min(1, "Selecciona un asesor."),
  reason: z.string().trim().max(500).optional(),
});

export const DateRangePresetSchema = z.enum([
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "custom",
]);

// ---------------------------------------------------------------------------
// Asistente conversacional — mensaje entrante desde ManyChat (External Request)
// ---------------------------------------------------------------------------

/**
 * ManyChat interpola {{variables}} como texto: un campo vacío puede llegar
 * como "" o como el literal sin reemplazar. Todo lo opcional se normaliza a
 * undefined; solo subscriber_id es obligatorio.
 */
const optionalManyChatText = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null) return undefined;
    const text = String(value).trim();
    return text && !/^\{\{.*\}\}$/.test(text) ? text : undefined;
  });

/**
 * Acepta dos formas:
 * - Plana: { subscriber_id, text, phone, name, message_id, last_interaction }.
 * - "{Full Contact Data}" de ManyChat (lo que envía la automatización
 *   "Asistente IA - Entrada"): el objeto Subscriber documentado en la API
 *   (id, name, last_input_text, whatsapp_phone, phone, last_interaction…).
 */
function fromFullContactData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const body = raw as Record<string, unknown>;
  if (body.subscriber_id !== undefined || body.id === undefined) return body;
  return {
    subscriber_id: body.id,
    text: body.last_input_text,
    phone: body.whatsapp_phone || body.phone,
    name: body.name,
    last_interaction: body.last_interaction,
  };
}

export const ManyChatMessageWebhookSchema = z.preprocess(
  fromFullContactData,
  z.object({
    subscriber_id: z
      .union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .pipe(z.string().regex(/^\d{1,20}$/, "subscriber_id inválido.")),
    text: optionalManyChatText,
    phone: optionalManyChatText,
    name: optionalManyChatText,
    message_id: optionalManyChatText,
    last_interaction: optionalManyChatText,
  })
);

export type ManyChatMessageWebhookPayload = z.infer<typeof ManyChatMessageWebhookSchema>;
