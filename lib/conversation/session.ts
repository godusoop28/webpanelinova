/**
 * Sesión conversacional y espera tras canalizar. Puro (sin red ni BD) para
 * probarlo igual que burst.ts.
 *
 * Dos cosas distintas que NO se mezclan:
 * - Espera automática (`reopenAt`): tras una canalización completada el bot
 *   solo da un aviso breve durante N minutos (10 por defecto) contados desde
 *   la canalización. Los mensajes del cliente no la prolongan. Al vencer, el
 *   siguiente mensaje abre una sesión nueva con la IA. No se envía nada solo
 *   porque venció.
 * - Pausa manual (`control` HUMAN/PAUSED desde el panel): el temporizador
 *   nunca la libera.
 *
 * Una sesión nueva NO es un lead nuevo ni una reasignación: el lead y el
 * asesor se conservan; solo cambia qué se considera "la solicitud actual".
 */
import { BRAND_NAME } from "@/lib/brand";

/** Sin actividad del cliente por más de esto, su siguiente mensaje abre sesión nueva (evita contestar pedidos viejos como actuales). */
export const SESSION_IDLE_MS = 6 * 60 * 60 * 1000;

/** Un aviso de espera como máximo cada 5 minutos (una ráfaga ya se agrupa en un solo aviso). */
export const WAIT_NOTICE_COOLDOWN_MS = 5 * 60 * 1000;

export type WaitReason = "commercial" | "human" | "management";

export type SessionDecision = "wait" | "new_session" | "continue";

/**
 * Qué hacer con un mensaje que llega ahora (la pausa manual se evalúa antes y aparte).
 * `lastInboundAt` es el mensaje ANTERIOR del cliente, no el que está llegando.
 */
export function decideSession(input: {
  now: Date;
  reopenAt: Date | null;
  lastInboundAt: Date | null;
  hasHistory: boolean;
}): SessionDecision {
  const { now, reopenAt, lastInboundAt, hasHistory } = input;
  if (reopenAt) return now.getTime() < reopenAt.getTime() ? "wait" : "new_session";
  if (hasHistory && lastInboundAt && now.getTime() - lastInboundAt.getTime() > SESSION_IDLE_MS) return "new_session";
  return "continue";
}

/** Fin de la espera, contado desde la canalización. 0 minutos = sin espera. */
export function computeReopenAt(completedAt: Date, minutes: number): Date | null {
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return new Date(completedAt.getTime() + minutes * 60 * 1000);
}

export function isWaiting(reopenAt: Date | null, now: Date): boolean {
  return Boolean(reopenAt && now.getTime() < reopenAt.getTime());
}

export function remainingWaitMinutes(reopenAt: Date, now: Date): number {
  return Math.max(1, Math.ceil((reopenAt.getTime() - now.getTime()) / 60_000));
}

export function shouldSendWaitNotice(input: { now: Date; waitNoticeAt: Date | null }): boolean {
  return !input.waitNoticeAt || input.now.getTime() - input.waitNoticeAt.getTime() >= WAIT_NOTICE_COOLDOWN_MS;
}

// ---------------------------------------------------------------------------
// Textos fijos (no generados): el nombre del asesor viene del backend.
// ---------------------------------------------------------------------------

export interface AssignmentFacts {
  /** assigned: asignación nueva; existing: ya tenía asesor vigente; no_advisor: sin asesor disponible. */
  status: "assigned" | "existing" | "no_advisor";
  advisorName: string | null;
  /** El aviso al asesor (ManyChat) se envió de verdad. */
  advisorNotified: boolean;
}

function cleanName(name: string | null | undefined): string | null {
  const value = name?.replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 80) : null;
}

/**
 * Confirmación de la canalización para el cliente. Nunca dice "ruleta",
 * nunca afirma un aviso que falló y no promete que el asesor escriba por
 * este mismo número.
 */
export function buildAssignmentConfirmation(facts: AssignmentFacts): string {
  const name = cleanName(facts.advisorName);
  if (facts.status === "no_advisor" || !name) {
    return `Tu solicitud quedó registrada. En este momento no hay un asesor disponible para asignarla automáticamente, así que el equipo de ${BRAND_NAME} la revisará.`;
  }
  if (facts.status === "existing") {
    return `Tu solicitud quedó registrada con ${name}, del equipo de asesores de ${BRAND_NAME}, que ya lleva tu seguimiento.`;
  }
  return facts.advisorNotified
    ? `Tu solicitud quedó asignada a ${name}, del equipo de asesores de ${BRAND_NAME}, y ya le enviamos tus datos para que te contacte (puede escribirte desde su propio WhatsApp).`
    : `Tu solicitud quedó asignada a ${name}, del equipo de asesores de ${BRAND_NAME}. El equipo le hará llegar tus datos para darte seguimiento.`;
}

function minutesText(minutes: number): string {
  return minutes === 1 ? "1 minuto" : `${minutes} minutos`;
}

/** Aviso durante la espera, adaptado al estado real de la canalización. */
export function buildWaitNotice(input: {
  reason: WaitReason;
  assignment: AssignmentFacts | null;
  minutesLeft: number;
  savedForTeam: boolean;
}): string {
  const name = cleanName(input.assignment?.advisorName);
  let head: string;
  if (input.reason === "commercial" && input.assignment && name && input.assignment.status !== "no_advisor") {
    head =
      input.assignment.status === "existing"
        ? `Tu solicitud ya está con ${name}, del equipo de asesores de ${BRAND_NAME}, que lleva tu seguimiento.`
        : input.assignment.advisorNotified
          ? `Tu solicitud ya fue enviada a ${name}, del equipo de asesores de ${BRAND_NAME}.`
          : `Tu solicitud ya quedó asignada a ${name}, del equipo de asesores de ${BRAND_NAME}.`;
  } else if (input.reason === "human") {
    head = `Tu solicitud ya quedó registrada para que una persona del equipo de ${BRAND_NAME} te atienda.`;
  } else {
    head = `Tu solicitud ya quedó registrada con el equipo de ${BRAND_NAME}.`;
  }
  const saved = input.savedForTeam ? " Guardé tu mensaje para que el equipo lo tenga presente." : "";
  return `${head}${saved} Si tienes otra duda o quieres iniciar una nueva conversación conmigo, espera ${minutesText(input.minutesLeft)} y vuelve a escribir.`;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** ¿La respuesta ya nombra al asesor? (nombre y primer apellido, sin acentos). */
export function mentionsAdvisor(reply: string, advisorName: string | null): boolean {
  const name = cleanName(advisorName);
  if (!name) return false;
  const words = normalize(name).split(" ").slice(0, 2);
  const text = normalize(reply);
  return words.every((word) => text.includes(word));
}

const LOW_SIGNAL_WORDS = new Set([
  "ok", "okay", "oki", "va", "vale", "sale", "si", "no", "gracias", "muchas", "mil", "perfecto", "excelente", "de", "acuerdo",
  "hola", "buen", "buenos", "buenas", "dia", "dias", "tarde", "tardes", "noche", "noches", "entendido", "listo", "claro", "que", "tal",
]);

/** Saludo/agradecimiento sin información nueva (no vale la pena registrarlo como pendiente). */
export function isLowSignalMessage(text: string): boolean {
  const words = normalize(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/(.)\1+$/u, "$1")); // "holaaa" → "hola", "okkk" → "ok"
  return words.length === 0 || words.every((word) => LOW_SIGNAL_WORDS.has(word));
}

/** ¿La canalización registrada ocurrió en la sesión actual? (una sesión nueva no la repite ni la cuenta como propia). */
export function handoffInCurrentSession(conversation: { handoffAt: Date | null; sessionStartedAt: Date | null }): boolean {
  if (!conversation.handoffAt) return false;
  return !conversation.sessionStartedAt || conversation.handoffAt.getTime() >= conversation.sessionStartedAt.getTime();
}
