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
  rol: z.string().trim().min(1, "El rol es obligatorio."),
  tipoAsignacion: z.string().trim().min(1, "El tipo de asignación es obligatorio."),
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

/**
 * Body Make sends to POST /api/integrations/make/select-advisor. `ruta` is
 * kept as a free string (not a strict enum of LEAD_ROUTES) so a route added
 * on the Make side isn't rejected outright before the code catches up —
 * advisors without an explicit route restriction still match it.
 */
export const SelectAdvisorRequestSchema = z.object({
  ruta: z.string().trim().min(1, "ruta es obligatoria."),
  origen: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  propertyId: z.string().trim().nullable().optional(),
});

export type SelectAdvisorRequest = z.infer<typeof SelectAdvisorRequestSchema>;

export const AuthorizedUserInputSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres."),
  correo: z.string().trim().toLowerCase().email("Correo inválido."),
  rol: RoleSchema,
  activo: z.boolean(),
});

export type AuthorizedUserInput = z.infer<typeof AuthorizedUserInputSchema>;

/**
 * Payload accepted from Make on the inbound webhook. Fields mirror the
 * columns of the EventosMake sheet; only `escenario` and `evento` are
 * mandatory since Make scenarios vary in what data they carry.
 */
export const MakeEventPayloadSchema = z.object({
  escenario: z.string().trim().min(1),
  evento: z.string().trim().min(1),
  estado: z.string().trim().default("recibido"),
  lead: z.string().trim().optional(),
  telefono: z.string().trim().optional(),
  propiedad: z.string().trim().optional(),
  asesor: z.string().trim().optional(),
  mensaje: z.string().trim().optional(),
  ejecucionId: z.string().trim().optional(),
});

export type MakeEventPayload = z.infer<typeof MakeEventPayloadSchema>;

export const DateRangePresetSchema = z.enum([
  "today",
  "this_week",
  "last_week",
  "last_30_days",
  "this_month",
  "custom",
]);
