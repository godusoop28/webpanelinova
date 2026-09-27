/**
 * Reglas de negocio del asistente que NO dependen de la IA: qué intención
 * puede entrar a la asignación comercial, con qué etiqueta del motor
 * existente, y qué datos conviene pedir. Puro para poder probarlo.
 *
 * La IA propone; estas funciones deciden.
 */

export const CONVERSATION_INTENTS = [
  "UNKNOWN",
  "PROPERTY_INQUIRY",
  "BUY",
  "RENT",
  "SELL",
  "LEASE_OUT",
  "INVEST",
  "AGENT_COLLABORATION",
  "PROVIDER",
  "MANAGEMENT",
  "HUMAN_REQUEST",
  "OTHER",
] as const;

export type ConversationIntentCode = (typeof CONVERSATION_INTENTS)[number];

export const INTENT_LABELS: Record<ConversationIntentCode, string> = {
  UNKNOWN: "Sin clasificar",
  PROPERTY_INQUIRY: "Propiedad concreta",
  BUY: "Comprar",
  RENT: "Rentar",
  SELL: "Vender inmueble propio",
  LEASE_OUT: "Poner en renta inmueble propio",
  INVEST: "Inversión",
  AGENT_COLLABORATION: "Colaboración con asesor externo",
  PROVIDER: "Proveedor / servicios",
  MANAGEMENT: "Gerencia / administración",
  HUMAN_REQUEST: "Pide atención humana",
  OTHER: "Otro",
};

/** Intenciones de cliente inmobiliario (rutas A y B). */
const REAL_ESTATE_INTENTS = new Set<ConversationIntentCode>([
  "PROPERTY_INQUIRY",
  "BUY",
  "RENT",
  "SELL",
  "LEASE_OUT",
  "INVEST",
]);

/** Nunca entran a la ruleta comercial, ni por timeout (ruta C). */
const NON_COMMERCIAL_INTENTS = new Set<ConversationIntentCode>(["PROVIDER", "MANAGEMENT"]);

export function isRealEstateIntent(intent: ConversationIntentCode): boolean {
  return REAL_ESTATE_INTENTS.has(intent);
}

export function hasRealEstateInterest(primary: ConversationIntentCode, secondary: ConversationIntentCode[]): boolean {
  return isRealEstateIntent(primary) || secondary.some(isRealEstateIntent);
}

export function isNonCommercial(primary: ConversationIntentCode): boolean {
  return NON_COMMERCIAL_INTENTS.has(primary);
}

export type HandoffTrigger = "assistant" | "human_request" | "abandonment";

export interface CommercialHandoffCheck {
  primaryIntent: ConversationIntentCode;
  secondaryIntents: ConversationIntentCode[];
  verifiedPropertyId: string | null;
  trigger: HandoffTrigger;
}

export type CommercialHandoffDecision =
  | { allowed: true; interesCliente: "Propiedad" | "Campaña" | "Explorar" | "Timeout"; datosPropiedad: string }
  | { allowed: false; reason: string };

/**
 * Traduce la intención conversacional a la entrada del motor de asignación
 * existente (lib/interest-classification.ts) SIN inventar rutas nuevas:
 *
 * - Propiedad verificada → "Propiedad" (asesor propio o ruleta de esa ruta).
 *   Si el cliente llegó con un código EB- (anuncio de campaña), se conserva
 *   "Campaña" como hacía el flujo anterior de ManyChat.
 * - Compra/renta/venta/inversión sin propiedad → "Explorar".
 * - Abandono con interés inmobiliario confirmado y sin propiedad → "Timeout"
 *   (misma bolsa de asesores que atendía los contactos inconclusos).
 * - Proveedor, gerencia, desconocido, otro → NUNCA: no deben caer a EXPLORE
 *   por el fallback del clasificador antiguo.
 * - Colaboración de asesor externo: solo con propiedad verificada (va al
 *   asesor de esa propiedad); si no, se canaliza a gerencia.
 */
export function decideCommercialHandoff(input: CommercialHandoffCheck & { fromCampaign: boolean }): CommercialHandoffDecision {
  const { primaryIntent, secondaryIntents, verifiedPropertyId, trigger, fromCampaign } = input;

  if (isNonCommercial(primaryIntent) && !secondaryIntents.some(isRealEstateIntent)) {
    return { allowed: false, reason: "Proveedor/gerencia no entra a la asignación comercial." };
  }

  if (verifiedPropertyId && (hasRealEstateInterest(primaryIntent, secondaryIntents) || primaryIntent === "AGENT_COLLABORATION" || trigger === "human_request")) {
    return fromCampaign
      ? { allowed: true, interesCliente: "Campaña", datosPropiedad: verifiedPropertyId }
      : { allowed: true, interesCliente: "Propiedad", datosPropiedad: verifiedPropertyId };
  }

  if (!hasRealEstateInterest(primaryIntent, secondaryIntents)) {
    return {
      allowed: false,
      reason:
        primaryIntent === "AGENT_COLLABORATION"
          ? "Colaboración sin propiedad identificada: se canaliza a gerencia."
          : "Todavía no hay interés inmobiliario confirmado.",
    };
  }

  return { allowed: true, interesCliente: trigger === "abandonment" ? "Timeout" : "Explorar", datosPropiedad: "" };
}

// ---------------------------------------------------------------------------
// Datos recopilados
// ---------------------------------------------------------------------------

export const FACT_KEYS = [
  "name",
  "operation",
  "property_type",
  "zone",
  "budget_min",
  "budget_max",
  "currency",
  "bedrooms",
  "timeframe",
  "own_property_location",
  "financing",
  "heard_from",
  "notes",
] as const;

export type FactKey = (typeof FACT_KEYS)[number];

export const FACT_LABELS: Record<FactKey, string> = {
  name: "Nombre",
  operation: "Operación",
  property_type: "Tipo de inmueble",
  zone: "Zona",
  budget_min: "Presupuesto mínimo",
  budget_max: "Presupuesto máximo",
  currency: "Moneda",
  bedrooms: "Recámaras",
  timeframe: "Plazo",
  own_property_location: "Ubicación de su inmueble",
  financing: "Forma de pago",
  heard_from: "Dónde vio la propiedad / cómo nos conoció (dicho por el cliente)",
  notes: "Notas",
};

export type FactStatus = "known" | "declined";
export type Facts = Partial<Record<FactKey, { value: string | null; status: FactStatus }>>;

/**
 * Fusiona lo que la IA reporta en este turno con lo ya guardado:
 * - "known" con valor reemplaza (el cliente puede corregirse).
 * - "declined" se respeta: no se vuelve a preguntar.
 * - "unknown" nunca borra un dato ya conocido o rechazado (la IA puede
 *   omitirlo en un turno sin que se pierda).
 */
export function mergeFacts(
  previous: Facts,
  update: Partial<Record<FactKey, { value: string | null; status: "known" | "declined" | "unknown" }>>
): Facts {
  const merged: Facts = { ...previous };
  for (const key of FACT_KEYS) {
    const incoming = update[key];
    if (!incoming || incoming.status === "unknown") continue;
    if (incoming.status === "declined") {
      merged[key] = { value: null, status: "declined" };
      continue;
    }
    const value = incoming.value?.trim();
    if (value) merged[key] = { value: value.slice(0, 300), status: "known" };
  }
  return merged;
}

/** Qué conviene saber según la intención — orientativo: la IA pregunta solo lo útil y una cosa por turno. */
export function usefulFactsFor(intent: ConversationIntentCode): FactKey[] {
  switch (intent) {
    case "BUY":
    case "RENT":
    case "INVEST":
      return ["zone", "property_type", "budget_max", "bedrooms"];
    case "SELL":
    case "LEASE_OUT":
      return ["own_property_location", "property_type"];
    default:
      return [];
  }
}

export function computeMissingFacts(intent: ConversationIntentCode, facts: Facts): FactKey[] {
  return usefulFactsFor(intent).filter((key) => !facts[key]);
}

// ---------------------------------------------------------------------------
// Respuestas del asistente: comprobaciones de seguridad sobre el texto
// ---------------------------------------------------------------------------

/** El proceso interno de asignación no se nombra ante el cliente. */
const INTERNAL_PROCESS_TERMS = /\bruleta\b/i;

export function mentionsInternalProcess(reply: string): boolean {
  return INTERNAL_PROCESS_TERMS.test(reply);
}

const ASSIGNMENT_CLAIM = /\b(asign(?:é|e|ado|ada|amos)|te canaliz(?:o|é|amos|aré)|(?:ya )?registr(?:é|amos) tu solicitud|te (?:va|van) a contactar|te contactar(?:á|a|án|an)|ya (?:le )?avis(?:é|e|amos)|notifiqu(?:é|e)|ya (?:tienes|tiene) (?:un )?asesor)/i;

/**
 * Detecta si el texto afirma una asignación/aviso. El backend lo compara
 * con lo que realmente ocurrió para impedir que la IA diga "ya te asigné"
 * cuando la acción no se completó.
 */
export function claimsAssignment(reply: string): boolean {
  return ASSIGNMENT_CLAIM.test(reply);
}

/** Códigos EB- mencionados en la respuesta que no fueron verificados en EasyBroker. */
export function unverifiedCodesInReply(reply: string, verifiedIds: Set<string>, extract: (text: string) => string[]): string[] {
  return extract(reply).filter((code) => !verifiedIds.has(code));
}
