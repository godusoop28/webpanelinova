/**
 * Cómo se explica en el panel el estado de una acción de integración
 * (IntegrationJob). Puro y sin "server-only": lo usan el panel, la cola de
 * reintentos (mensajes de auditoría) y las pruebas.
 *
 * Nunca incluye tokens ni el payload: solo acción, destino, intentos,
 * motivo saneado y código.
 */

export type JobStatus = "PENDING" | "RETRYING" | "SUCCESS" | "FAILED" | "UNCERTAIN" | "CANCELLED";

export interface NoticeJob {
  id: string;
  type: string;
  status: JobStatus | string;
  attempts: number;
  lastError: string | null;
  errorKind: string | null;
  errorCode: string | null;
  lastAttemptAt: Date | string | null;
  nextRetryAt: Date | string | null;
  createdAt: Date | string;
}

export type NoticeTone = "danger" | "warning";

export interface IntegrationNotice {
  jobId: string;
  tone: NoticeTone;
  /** Resumen corto: "Reintento programado", "Requiere revisar la configuración"… */
  title: string;
  action: string;
  target: string;
  lastAttemptAt: string | null;
  attempts: number;
  reason: string;
  code: string | null;
  nextRetryAt: string | null;
}

export const JOB_ACTION_LABELS: Record<string, string> = {
  MANYCHAT_FLOW: "Aviso al asesor por WhatsApp (flujo de ManyChat)",
  MANYCHAT_FIELDS: "Actualizar datos del contacto en ManyChat",
  EASYBROKER_CREATE: "Crear contacto en EasyBroker",
  EASYBROKER_ASSIGN: "Asignar asesor en EasyBroker",
};

const KIND_EXPLANATIONS: Record<string, string> = {
  CONFIG: "Falta configuración indispensable.",
  AUTH: "ManyChat rechazó la autenticación o los permisos del token.",
  FLOW: "ManyChat rechazó el flujo configurado (inexistente, mal escrito o sin publicar).",
  CONTACT: "ManyChat rechazó el contacto destinatario para esta operación.",
  CHANNEL: "El canal no permitió el envío (p. ej. ventana de 24 h de WhatsApp o contacto sin opt-in).",
  RATE_LIMIT: "ManyChat limitó la cantidad de solicitudes.",
  PROVIDER: "Error temporal del proveedor.",
  TIMEOUT: "ManyChat no respondió a tiempo.",
  NETWORK: "Falló la conexión con ManyChat.",
  REJECTED: "ManyChat rechazó la solicitud.",
  LOCAL: "Error interno al procesar la acción.",
  SUPERSEDED: "La acción ya no aplica.",
};

const CONFIG_KINDS = new Set(["CONFIG", "AUTH", "FLOW"]);

/** Estados que siguen pidiendo atención en el panel. */
export function isOpenJob(status: string): boolean {
  return status === "PENDING" || status === "RETRYING" || status === "FAILED" || status === "UNCERTAIN";
}

export function noticeTitle(job: Pick<NoticeJob, "status" | "errorKind">): string {
  switch (job.status) {
    case "PENDING":
      return "Automatización pendiente";
    case "RETRYING":
      return "Reintento programado";
    case "UNCERTAIN":
      return "Resultado de envío incierto";
    case "FAILED":
      return job.errorKind && CONFIG_KINDS.has(job.errorKind) ? "Requiere revisar la configuración" : "No se pudo ejecutar la automatización";
    case "SUCCESS":
      return "Automatización confirmada";
    default:
      return "Automatización descartada";
  }
}

/** Motivo legible: explicación del tipo de fallo + mensaje del proveedor si lo hay. */
export function noticeReason(job: Pick<NoticeJob, "status" | "errorKind" | "lastError">): string {
  const explanation = job.errorKind ? KIND_EXPLANATIONS[job.errorKind] : null;
  const detail = job.lastError?.trim() || null;
  if (job.status === "UNCERTAIN") return `${detail ?? "Sin respuesta del proveedor."} Verifica en ManyChat si llegó antes de reenviar.`;
  if (explanation && detail && !detail.startsWith(explanation)) return `${explanation} ${detail}`;
  return explanation ?? detail ?? "Sin detalle registrado.";
}

function iso(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Aviso vigente de un lead a partir de sus trabajos. Por cada tipo de
 * acción manda el trabajo más reciente: si se confirmó (SUCCESS) o se
 * descartó, los fallos antiguos de ese tipo ya no se muestran como
 * pendientes (siguen en el historial). `confirmedTypes` cubre recuperaciones
 * por otra vía (p. ej. el aviso quedó confirmado en la asignación).
 */
export function currentIntegrationNotice(
  jobs: NoticeJob[],
  context: { targetFor?: (job: NoticeJob) => string; confirmedTypes?: string[] } = {}
): IntegrationNotice | null {
  const latestByType = new Map<string, NoticeJob>();
  for (const job of jobs) {
    const current = latestByType.get(job.type);
    if (!current || new Date(job.createdAt).getTime() > new Date(current.createdAt).getTime()) latestByType.set(job.type, job);
  }
  const confirmed = new Set(context.confirmedTypes ?? []);
  const open = [...latestByType.values()].filter((job) => isOpenJob(job.status) && !confirmed.has(job.type));
  if (open.length === 0) return null;
  // Lo que requiere acción humana primero; luego lo que se resolverá solo.
  const rank = (job: NoticeJob) => (job.status === "FAILED" ? 0 : job.status === "UNCERTAIN" ? 1 : job.status === "RETRYING" ? 2 : 3);
  const job = open.sort((a, b) => rank(a) - rank(b))[0];
  const scheduled = job.status === "RETRYING" || job.status === "PENDING";
  return {
    jobId: job.id,
    tone: scheduled ? "warning" : "danger",
    title: noticeTitle(job),
    action: JOB_ACTION_LABELS[job.type] ?? job.type,
    target: context.targetFor?.(job) ?? "—",
    lastAttemptAt: iso(job.lastAttemptAt),
    attempts: job.attempts,
    reason: noticeReason(job),
    code: job.errorCode,
    nextRetryAt: scheduled ? iso(job.nextRetryAt) : null,
  };
}

/** Mensaje de auditoría de un intento fallido, en lugar del texto técnico "Reintento de X falló". */
export function failureAuditMessage(input: {
  type: string;
  status: JobStatus;
  errorKind: string | null;
  errorCode: string | null;
  reason: string;
  attempts: number;
  nextRetryAt: Date | null;
}): string {
  const title = noticeTitle({ status: input.status, errorKind: input.errorKind });
  const action = JOB_ACTION_LABELS[input.type] ?? input.type;
  const next = input.nextRetryAt ? `; próximo intento ${input.nextRetryAt.toISOString()}` : input.status === "RETRYING" ? "" : "; sin reintento automático";
  return `${action}: ${title}. ${input.reason}${input.errorCode ? ` [${input.errorCode}]` : ""} (intento ${input.attempts}${next}).`;
}

/** Destino legible de un trabajo sin exponer IDs completos. */
export function noticeTarget(
  job: { type: string; payload?: unknown },
  advisor: { name: string; manyChatSubscriberId: string | null } | null
): string {
  if (job.type.startsWith("EASYBROKER")) return "EasyBroker";
  const subscriberId = (job.payload as { subscriberId?: unknown } | null)?.subscriberId;
  if (advisor && typeof subscriberId === "string" && subscriberId === advisor.manyChatSubscriberId) return `Asesor ${advisor.name} (ManyChat)`;
  const suffix = typeof subscriberId === "string" ? subscriberId.slice(-4) : "";
  return suffix ? `Contacto ManyChat de un asesor anterior (…${suffix})` : "Contacto ManyChat";
}

/** Eventos de auditoría que describen un trabajo de integración: el estado del trabajo manda sobre su texto. */
const JOB_AUDIT_EVENTS = new Set(["INTEGRATION_JOB_FAILED", "RETRY_SCHEDULED"]);

/**
 * Primer error del historial que NO está explicado por un trabajo de
 * integración. Un MANYCHAT_NOTIFICATION_FAILED queda cubierto cuando hay un
 * MANYCHAT_FLOW creado después (el trabajo lo describe) o cuando el aviso ya
 * quedó confirmado en la asignación (recuperado).
 */
export function uncoveredAuditError(
  logs: { eventType: string; message: string | null; createdAt: Date | string }[],
  jobs: { type: string; createdAt: Date | string }[],
  assignmentNotified: boolean
): string {
  for (const log of logs) {
    if (JOB_AUDIT_EVENTS.has(log.eventType)) continue;
    if (log.eventType === "MANYCHAT_NOTIFICATION_FAILED") {
      const at = new Date(log.createdAt).getTime();
      if (assignmentNotified || jobs.some((job) => job.type === "MANYCHAT_FLOW" && new Date(job.createdAt).getTime() >= at)) continue;
    }
    return log.message ?? "";
  }
  return "";
}
