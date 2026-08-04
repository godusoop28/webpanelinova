import { z } from "zod";

export const RoleSchema = z.enum(["ADMIN", "DIRECCION", "CONSULTA"]);

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
