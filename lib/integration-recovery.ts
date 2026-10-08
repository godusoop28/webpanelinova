/**
 * Clasificación de los avisos MANYCHAT_FLOW abiertos para una recuperación
 * selectiva. Pura (sin "server-only") para probarla; la consulta y la
 * ejecución viven en lib/services/integration-recovery.service.ts.
 */

export type RecoveryCategory =
  /** Lead asignado; el aviso sigue en la cola con reintentos automáticos. */
  | "ASSIGNED_NOTICE_PENDING"
  /** El lead no tiene asesor asignado: no hay a quién avisar. */
  | "UNASSIGNED"
  /** Fallo permanente o intentos agotados: requiere revisión antes de reintentar. */
  | "PERMANENT_FAILURE"
  /** Timeout/caída de red en el envío: verificar en ManyChat antes de reenviar. */
  | "UNCERTAIN"
  /** El aviso ya quedó confirmado por otra vía; solo falta cerrar el trabajo antiguo. */
  | "RECOVERED_STALE_NOTICE"
  /** El lead cambió de asesor: el aviso al asesor anterior ya no aplica. */
  | "SUPERSEDED";

export type RecoveryAction = "wait" | "review_then_requeue" | "close" | "assign_manually";

export interface RecoveryJobInput {
  status: string;
  subscriberId: string | null;
}

export interface RecoveryLeadState {
  exists: boolean;
  assignedAdvisorId: string | null;
  assignedAdvisorSubscriberId: string | null;
  /** La asignación vigente ya tiene el aviso confirmado, o hay un MANYCHAT_FLOW posterior en SUCCESS. */
  noticeConfirmed: boolean;
}

export function categorizeRecovery(job: RecoveryJobInput, lead: RecoveryLeadState): { category: RecoveryCategory; action: RecoveryAction } {
  if (!lead.exists || !lead.assignedAdvisorId) return { category: "UNASSIGNED", action: "assign_manually" };
  if (lead.noticeConfirmed) return { category: "RECOVERED_STALE_NOTICE", action: "close" };
  if (job.subscriberId !== lead.assignedAdvisorSubscriberId) return { category: "SUPERSEDED", action: "close" };
  if (job.status === "UNCERTAIN") return { category: "UNCERTAIN", action: "review_then_requeue" };
  if (job.status === "FAILED") return { category: "PERMANENT_FAILURE", action: "review_then_requeue" };
  return { category: "ASSIGNED_NOTICE_PENDING", action: "wait" };
}

/** Qué acción manual se permite ejecutar para cada categoría (se recalcula al ejecutar). */
export const REQUEUEABLE: ReadonlySet<RecoveryCategory> = new Set(["PERMANENT_FAILURE", "UNCERTAIN"]);
export const CLOSABLE: ReadonlySet<RecoveryCategory> = new Set(["RECOVERED_STALE_NOTICE", "SUPERSEDED"]);
