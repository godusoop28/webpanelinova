/**
 * View-shape contracts consumed by the panel's Server Components and
 * Client Components. No "server-only" here on purpose — these types are
 * imported from Client Components (forms, rows) too.
 */

export interface AdvisorView {
  id: string;
  nombre: string;
  whatsapp: string;
  activo: boolean;
  emailEasyBroker: string;
  manyChatId: string;
  peso: number;
  /** [] significa "todas las rutas". */
  rutasPermitidas: string[];
  /** ISO, "INDEFINIDO", o null si no está pausado. */
  pausadoHasta: string | null;
  limiteDiario: number | null;
  observaciones: string;
}

export interface LeadView {
  id: string;
  fechaHora: string;
  nombre: string;
  telefono: string;
  tipoInteres: string;
  datoEnviado: string;
  origen: string;
  ruta: string;
  estado: string;
  linkWhatsappCliente: string;
  asesorAsignado: string;
  asesorTelefono: string;
  metodoAsignacion: string;
  manyChatNotificado: boolean;
  easyBrokerConfirmado: boolean;
  /** Mensaje del AuditLog de error más reciente, o "" si el lead no falló. */
  error: string;
}
