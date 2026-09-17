/** No "server-only": the status labels are used by Client Components (leads list filter, detail panel) too. */
export const LEAD_STATUS_LABELS: Record<string, string> = {
  RECEIVED: "Recibido",
  PROCESSING: "Procesando",
  CREATED_IN_EASYBROKER: "Creado en EasyBroker",
  ASSIGNED: "Asignado",
  NOTIFIED: "Notificado",
  COMPLETED: "Completado",
  FAILED: "Con error",
};

export function leadStatusLabel(status: string): string {
  return LEAD_STATUS_LABELS[status] ?? status;
}
