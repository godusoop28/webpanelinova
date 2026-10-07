/**
 * Etiquetas visibles de los pendientes de conversación. Los valores del
 * backend (MANAGEMENT, FOLLOW_UP…) no cambian; solo su presentación.
 * Sin "server-only": lo usan componentes del panel.
 */
export const ESCALATION_TYPE_LABELS: Record<string, string> = {
  MANAGEMENT: "Gerencia",
  HUMAN: "Atención humana",
  FOLLOW_UP: "Seguimiento",
  PROCESSING_ERROR: "Error de procesamiento",
};

export function escalationTypeLabel(type: string): string {
  return ESCALATION_TYPE_LABELS[type] ?? type;
}

/**
 * Estado del pendiente. PENDING = registrado en el panel, nadie fue avisado
 * automáticamente (no significa que no haya seguimiento); NOTIFIED = se
 * envió el aviso a gerencia; RESOLVED = cerrado por alguien del equipo.
 */
export const ESCALATION_STATUS_LABELS: Record<string, { label: string; detail: string; tone: "warning" | "info" | "neutral" }> = {
  PENDING: { label: "Sin aviso enviado", detail: "Registrado en el panel; nadie fue notificado automáticamente.", tone: "warning" },
  NOTIFIED: { label: "Aviso enviado", detail: "Se avisó a gerencia por WhatsApp.", tone: "info" },
  RESOLVED: { label: "Resuelto", detail: "Cerrado por el equipo.", tone: "neutral" },
};

export function escalationStatus(status: string) {
  return ESCALATION_STATUS_LABELS[status] ?? { label: status, detail: "", tone: "neutral" as const };
}
