/**
 * Agrupación de mensajes consecutivos ("ráfagas"). Puro y sin
 * "server-only" para poder probarlo sin base de datos, igual que
 * lib/assignment-engine.ts.
 *
 * Cada mensaje nuevo empuja `processAfter` a now + debounce, pero nunca más
 * allá de burstStartedAt + maxWait: un cliente que escribe sin parar recibe
 * respuesta como máximo `maxWait` segundos después de su primer mensaje de
 * la ráfaga.
 */

import crypto from "node:crypto";

export interface BurstSettings {
  debounceSeconds: number;
  maxWaitSeconds: number;
}

export function computeProcessAfter(input: {
  now: Date;
  /** Inicio de la ráfaga pendiente, o null si no había mensajes sin procesar. */
  burstStartedAt: Date | null;
  settings: BurstSettings;
}): { processAfter: Date; burstStartedAt: Date } {
  const { now, settings } = input;
  const burstStartedAt = input.burstStartedAt ?? now;
  const debounceMs = Math.max(0, settings.debounceSeconds) * 1000;
  const maxWaitMs = Math.max(settings.debounceSeconds, settings.maxWaitSeconds) * 1000;
  const byDebounce = now.getTime() + debounceMs;
  const byCap = burstStartedAt.getTime() + maxWaitMs;
  return { processAfter: new Date(Math.min(byDebounce, byCap)), burstStartedAt };
}

export function isBurstReady(processAfter: Date | null, now: Date): boolean {
  return !processAfter || processAfter.getTime() <= now.getTime();
}

/** Normaliza texto para comparar reentregas: espacios y mayúsculas no cuentan, el contenido sí. */
function normalizeForDedupe(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Clave de deduplicación de una entrega de ManyChat.
 *
 * - Si el canal manda un ID de mensaje estable, se usa tal cual.
 * - Si no (WhatsApp vía External Request no expone ID por mensaje), se usa
 *   una huella de subscriber + texto + marca de tiempo de la interacción
 *   que ManyChat reporta ({{last_interaction}}): una reentrega del MISMO
 *   evento repite los tres valores; un mensaje legítimo repetido ("sí",
 *   "sí") llega con otra marca de tiempo y no se descarta.
 * - Sin ID ni marca de tiempo no hay forma segura de distinguir: se
 *   devuelve null y el mensaje se guarda siempre (preferimos un duplicado
 *   visible a perder un mensaje real).
 */
export function buildInboundDedupeKey(input: {
  messageId?: string | null;
  subscriberId: string;
  text: string;
  interactionAt?: string | null;
}): string | null {
  const messageId = input.messageId?.trim();
  if (messageId) return `id:${messageId}`;
  const interactionAt = input.interactionAt?.trim();
  if (!interactionAt) return null;
  const raw = `${input.subscriberId}|${interactionAt}|${normalizeForDedupe(input.text)}`;
  return `fp:${crypto.createHash("sha256").update(raw).digest("hex")}`;
}
