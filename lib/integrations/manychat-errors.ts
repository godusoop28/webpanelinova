/**
 * Errores de ManyChat y su clasificación. Puro (sin "server-only") para
 * poder probarlo y usarlo desde la cola de reintentos y desde el panel.
 *
 * La clasificación decide si un fallo se reintenta solo, si requiere
 * revisión humana o si el resultado es incierto. Se basa en el código HTTP
 * y en el cuerpo que devolvió ManyChat ({status:"error", message, details}),
 * nunca en suposiciones: lo que no se reconoce queda como REJECTED con el
 * mensaje del proveedor visible para revisarlo.
 */

export class ManyChatApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
    /** "POST /fb/sending/sendFlow" — qué operación falló. */
    public endpoint?: string,
    /** Retry-After del proveedor, si lo mandó (429/503). */
    public retryAfterMs?: number | null
  ) {
    const providerMessage = manyChatProviderMessage(body);
    super(`ManyChat API error ${status} ${statusText}${endpoint ? ` en ${endpoint}` : ""}${providerMessage ? `: ${providerMessage}` : ""}`);
    this.name = "ManyChatApiError";
  }
}

/**
 * La petición salió pero no hubo respuesta a tiempo: ManyChat pudo haberla
 * aceptado. Para envíos esto es AMBIGUO y no debe reintentarse a ciegas.
 */
export class ManyChatTimeoutError extends Error {
  constructor(public path: string, timeoutMs: number) {
    super(`[MANYCHAT] Timeout tras ${timeoutMs}ms en ${path}`);
    this.name = "ManyChatTimeoutError";
  }
}

/** Falló la conexión (DNS, reset…). No se sabe si la petición llegó. */
export class ManyChatNetworkError extends Error {
  constructor(public path: string, cause: unknown) {
    super(`[MANYCHAT] Error de red en ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ManyChatNetworkError";
  }
}

/** Falta configuración local indispensable (no se llamó a ManyChat). */
export class ManyChatConfigError extends Error {
  constructor(public missing: string, message: string) {
    super(message);
    this.name = "ManyChatConfigError";
  }
}

export type ManyChatFailureKind =
  | "CONFIG" // falta o es inválida la configuración local
  | "AUTH" // token rechazado o sin permisos
  | "FLOW" // flujo inexistente, mal escrito o no publicado
  | "CONTACT" // subscriber inexistente o no válido para la operación
  | "CHANNEL" // restricción del canal (ventana de 24 h, opt-in, canal desactivado)
  | "RATE_LIMIT" // 429
  | "PROVIDER" // 5xx temporal de ManyChat
  | "TIMEOUT" // sin respuesta: resultado incierto
  | "NETWORK" // conexión caída: resultado incierto
  | "REJECTED" // 4xx no reconocido: ManyChat rechazó la petición
  | "LOCAL"; // excepción propia al procesar

export interface ManyChatFailure {
  kind: ManyChatFailureKind;
  /** Puede reintentarse solo con espera progresiva. */
  retryable: boolean;
  /** ManyChat pudo haber ejecutado la acción; no se reintenta sin revisión. */
  uncertain: boolean;
  /** "HTTP_400", "TIMEOUT", "CONFIG_MANYCHAT_ADVISOR_FLOW_ID"… */
  code: string;
  /** Motivo legible y seguro para el panel (sin tokens ni payload completo). */
  reason: string;
  retryAfterMs: number | null;
}

const MAX_REASON = 300;

/** Mensaje del cuerpo de error de ManyChat ({status:"error", message, details}), recortado y sin datos sensibles. */
export function manyChatProviderMessage(body: unknown): string | null {
  if (!body) return null;
  if (typeof body === "string") return sanitize(body);
  if (typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.message === "string" && record.message.trim()) parts.push(record.message.trim());
  const details = record.details;
  if (details && typeof details === "object") {
    const messages = (details as Record<string, unknown>).messages;
    const list = Array.isArray(messages) ? messages : Array.isArray(details) ? details : null;
    for (const item of list ?? []) {
      const text = typeof item === "string" ? item : item && typeof item === "object" && typeof (item as { message?: unknown }).message === "string" ? (item as { message: string }).message : null;
      if (text) parts.push(text);
    }
    if (!list) {
      for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
        if (typeof value === "string") parts.push(`${key}: ${value}`);
        else if (Array.isArray(value)) parts.push(`${key}: ${value.filter((v) => typeof v === "string").join(", ")}`);
      }
    }
  }
  return parts.length ? sanitize(parts.join(" | ")) : null;
}

/** Quita lo que parezca token/clave y números largos (teléfonos) antes de mostrar. */
export function sanitize(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [oculto]")
    .replace(/\b\d{4,}:[A-Za-z0-9_-]{8,}\b/g, "[oculto]")
    .replace(/\+?\d[\d\s-]{9,}\d/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REASON);
}

const CHANNEL_PATTERN = /24[\s-]*(h|hour|hora)|window|ventana|template|plantilla|message[_\s]?tag|outside|opt[\s-]?in|not\s+subscribed|unsubscribed|channel|canal|whatsapp.*(disabled|not\s+connected)|can'?t\s+be\s+sent|cannot\s+send/i;
const FLOW_PATTERN = /flow|flujo|content\d|flow_ns/i;
const CONTACT_PATTERN = /subscriber|suscriptor|contact|user\s+not\s+found|blocked|bloque/i;
const AUTH_PATTERN = /token|unauthori[sz]ed|forbidden|permission|access\s+denied|api\s+key/i;

/**
 * `idempotent`: la operación puede repetirse sin efectos visibles (escribir
 * Custom Fields). Para envíos (sendFlow) un timeout o una caída de red es
 * incierto y NO se reintenta automáticamente.
 */
export function classifyManyChatFailure(error: unknown, options: { idempotent?: boolean } = {}): ManyChatFailure {
  const idempotent = options.idempotent ?? false;

  if (error instanceof ManyChatConfigError) {
    return { kind: "CONFIG", retryable: false, uncertain: false, code: `CONFIG_${error.missing}`, reason: error.message, retryAfterMs: null };
  }
  if (error instanceof ManyChatTimeoutError) {
    return idempotent
      ? { kind: "TIMEOUT", retryable: true, uncertain: false, code: "TIMEOUT", reason: "ManyChat no respondió a tiempo.", retryAfterMs: null }
      : { kind: "TIMEOUT", retryable: false, uncertain: true, code: "TIMEOUT", reason: "ManyChat no respondió a tiempo: el envío pudo haberse ejecutado.", retryAfterMs: null };
  }
  if (error instanceof ManyChatNetworkError) {
    return idempotent
      ? { kind: "NETWORK", retryable: true, uncertain: false, code: "NETWORK", reason: "Falló la conexión con ManyChat.", retryAfterMs: null }
      : { kind: "NETWORK", retryable: false, uncertain: true, code: "NETWORK", reason: "Se perdió la conexión con ManyChat durante el envío: pudo haberse ejecutado.", retryAfterMs: null };
  }
  if (error instanceof ManyChatApiError) {
    const providerMessage = manyChatProviderMessage(error.body);
    const http = error.status;
    const code = http >= 200 && http < 300 ? `BODY_ERROR_${http}` : `HTTP_${http}`;
    const reason = providerMessage ?? (http >= 200 && http < 300 ? "ManyChat respondió con status \"error\" sin detalle." : `ManyChat respondió HTTP ${http} sin detalle en el cuerpo.`);
    const base = { code, reason, retryAfterMs: error.retryAfterMs ?? null };

    if (http === 429) return { ...base, kind: "RATE_LIMIT", retryable: true, uncertain: false };
    if (http >= 500) return { ...base, kind: "PROVIDER", retryable: true, uncertain: false };
    if (http === 401 || http === 403) return { ...base, kind: "AUTH", retryable: false, uncertain: false };
    const text = providerMessage ?? "";
    // El orden importa: "flow can't be sent outside the 24h window" es del canal, no del flujo.
    if (CHANNEL_PATTERN.test(text)) return { ...base, kind: "CHANNEL", retryable: false, uncertain: false };
    if (AUTH_PATTERN.test(text)) return { ...base, kind: "AUTH", retryable: false, uncertain: false };
    if (FLOW_PATTERN.test(text)) return { ...base, kind: "FLOW", retryable: false, uncertain: false };
    if (CONTACT_PATTERN.test(text)) return { ...base, kind: "CONTACT", retryable: false, uncertain: false };
    return { ...base, kind: "REJECTED", retryable: false, uncertain: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: "LOCAL", retryable: false, uncertain: false, code: "LOCAL", reason: sanitize(message || "Error desconocido"), retryAfterMs: null };
}

/** Retry-After: segundos o fecha HTTP. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - now);
}
