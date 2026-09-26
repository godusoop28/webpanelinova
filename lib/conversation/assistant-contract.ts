import { z } from "zod";
import { CONVERSATION_INTENTS, FACT_KEYS, type FactKey } from "@/lib/conversation/policy";

/**
 * Contrato entre el backend y el modelo: definiciones de herramientas
 * (JSON Schema estricto de OpenAI) y los esquemas Zod con que el backend
 * vuelve a validar TODO lo que el modelo devuelve. Puro, sin red.
 */

const FACT_STATUS = ["known", "declined", "unknown"] as const;

const factJsonSchema = {
  type: "object",
  properties: {
    value: { type: ["string", "null"] },
    status: { type: "string", enum: FACT_STATUS },
  },
  required: ["value", "status"],
  additionalProperties: false,
} as const;

export const FINAL_OUTPUT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description: "Mensaje para el cliente por WhatsApp. Vacío solo si no corresponde responder.",
    },
    primary_intent: { type: "string", enum: CONVERSATION_INTENTS },
    secondary_intents: { type: "array", items: { type: "string", enum: CONVERSATION_INTENTS } },
    facts: {
      type: "object",
      properties: Object.fromEntries(FACT_KEYS.map((key) => [key, factJsonSchema])),
      required: [...FACT_KEYS],
      additionalProperties: false,
    },
    property_ids: {
      type: "array",
      items: { type: "string" },
      description: "Códigos EB- de propiedades de las que habla el cliente, SOLO si una herramienta los confirmó.",
    },
    summary: {
      type: "string",
      description: "Resumen breve y factual de toda la conversación para el asesor (máx. 3 frases).",
    },
    asked_clarification: {
      type: "boolean",
      description: "true si la respuesta pide al cliente aclarar o completar algo.",
    },
    made_progress: {
      type: "boolean",
      description: "true si este turno aportó información nueva útil o resolvió algo.",
    },
  },
  required: [
    "reply",
    "primary_intent",
    "secondary_intents",
    "facts",
    "property_ids",
    "summary",
    "asked_clarification",
    "made_progress",
  ],
  additionalProperties: false,
} as const;

const FactSchema = z.object({ value: z.string().max(500).nullable(), status: z.enum(FACT_STATUS) });

export const FinalOutputSchema = z.object({
  reply: z.string().max(1500),
  primary_intent: z.enum(CONVERSATION_INTENTS),
  secondary_intents: z.array(z.enum(CONVERSATION_INTENTS)).max(6),
  facts: z.object(Object.fromEntries(FACT_KEYS.map((key) => [key, FactSchema])) as Record<FactKey, typeof FactSchema>),
  property_ids: z.array(z.string().max(40)).max(10),
  summary: z.string().max(1200),
  asked_clarification: z.boolean(),
  made_progress: z.boolean(),
});

export type FinalOutput = z.infer<typeof FinalOutputSchema>;

// ---------------------------------------------------------------------------
// Herramientas: solo capacidades acotadas. Nada de SQL, URLs arbitrarias,
// elegir asesor o escribir estados de éxito.
// ---------------------------------------------------------------------------

/** Intenciones con las que se puede pedir canalización comercial (el backend vuelve a validarlas). */
export const HANDOFF_INTENTS = ["PROPERTY_INQUIRY", "BUY", "RENT", "SELL", "LEASE_OUT", "INVEST", "AGENT_COLLABORATION"] as const;

export const TOOL_NAMES = [
  "search_properties",
  "get_property",
  "resolve_link",
  "check_assignment",
  "request_commercial_handoff",
  "request_management",
  "request_human",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_ARG_SCHEMAS = {
  search_properties: z.object({
    query: z.string().trim().min(1).max(300),
    operation: z.enum(["sale", "rental", "any"]),
  }),
  get_property: z.object({ public_id: z.string().trim().min(3).max(40) }),
  resolve_link: z.object({ url: z.string().trim().min(8).max(1000) }),
  check_assignment: z.object({}),
  request_commercial_handoff: z.object({
    intent: z.enum(HANDOFF_INTENTS),
    reason: z.string().trim().min(3).max(500),
    property_public_id: z.string().trim().max(40).nullable(),
  }),
  request_management: z.object({
    category: z.enum(["provider", "management", "agent_collaboration", "complaint", "other"]),
    reason: z.string().trim().min(3).max(500),
  }),
  request_human: z.object({ reason: z.string().trim().min(3).max(500) }),
} satisfies Record<ToolName, z.ZodTypeAny>;

export type ToolArgs<T extends ToolName> = z.infer<(typeof TOOL_ARG_SCHEMAS)[T]>;

export const OPENAI_TOOLS = [
  {
    type: "function",
    name: "search_properties",
    description:
      "Busca en el inventario publicado de Century 21 Innova (EasyBroker) por texto: título, colonia, zona, tipo. Devuelve hasta 5 candidatos. Úsala para identificar una propiedad concreta o mostrar opciones reales.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Lo que describe el cliente: nombre, colonia, zona, tipo, características." },
        operation: { type: "string", enum: ["sale", "rental", "any"] },
      },
      required: ["query", "operation"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_property",
    description:
      "Consulta el detalle vigente de una propiedad en EasyBroker por su código (EB-XXXX). Obligatorio antes de afirmar precio, disponibilidad o características.",
    strict: true,
    parameters: {
      type: "object",
      properties: { public_id: { type: "string", description: "Código EasyBroker, p. ej. EB-AB1234" } },
      required: ["public_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "resolve_link",
    description:
      "Intenta identificar la propiedad de un enlace que envió el cliente. Solo funciona con enlaces compatibles; si no se puede, lo indica.",
    strict: true,
    parameters: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_assignment",
    description: "Indica si este contacto ya tiene un asesor asignado o una canalización registrada.",
    strict: true,
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
  },
  {
    type: "function",
    name: "request_commercial_handoff",
    description:
      "Solicita canalizar al cliente inmobiliario con un asesor usando las reglas de asignación de la empresa (el sistema elige al asesor, no tú). Úsala cuando la propiedad está identificada, o cuando ya sabes qué busca/ofrece y tiene sentido que lo atienda un asesor, o si pide hablar con alguien. El resultado dice qué ocurrió realmente.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        intent: { type: "string", enum: HANDOFF_INTENTS, description: "Necesidad inmobiliaria principal del cliente." },
        reason: { type: "string", description: "Motivo breve del contacto para el asesor." },
        property_public_id: { type: ["string", "null"], description: "Código EB- verificado, o null." },
      },
      required: ["intent", "reason", "property_public_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_management",
    description:
      "Registra un asunto para gerencia/administración: proveedores, colaboraciones, quejas u otros temas que no son de un cliente inmobiliario. Nunca asigna asesor comercial.",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", enum: ["provider", "management", "agent_collaboration", "complaint", "other"] },
        reason: { type: "string" },
      },
      required: ["category", "reason"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_human",
    description:
      "El cliente pide hablar con una persona o la conversación no avanza: registra la solicitud para que alguien del equipo atienda y deja de responder la IA.",
    strict: true,
    parameters: {
      type: "object",
      properties: { reason: { type: "string" } },
      required: ["reason"],
      additionalProperties: false,
    },
  },
] as const;
