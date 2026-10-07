import { BellOff, CircleDashed, Compass, Home, Megaphone, type LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { CanonicalRoute } from "@/lib/reporting/report-aggregation";

export const ROUTE_ICONS: Record<CanonicalRoute, LucideIcon> = {
  PROPERTY: Home,
  EXPLORE: Compass,
  CAMPAIGN: Megaphone,
  TIMEOUT: BellOff,
  OTHER: CircleDashed,
};

/** Tono por etiqueta del estado del proceso del lead (lib/lead-status.ts). Conserva el significado de cada estado. */
export function leadStatusTone(label: string): BadgeTone {
  switch (label) {
    case "Con error":
      return "danger";
    case "Recibido":
      return "warning";
    case "Procesando":
    case "Creado en EasyBroker":
      return "info";
    case "Asignado":
    case "Notificado":
    case "Completado":
      return "success";
    default:
      return "neutral";
  }
}

export function LeadStatusBadge({ label }: { label: string }) {
  return (
    <Badge tone={leadStatusTone(label)} dot>
      {label || "—"}
    </Badge>
  );
}

const ASSIGNMENT: Record<string, { label: string; tone: BadgeTone }> = {
  PENDING: { label: "Pendiente", tone: "warning" },
  ASSIGNED: { label: "Asignado", tone: "success" },
  CONFIRMED: { label: "Confirmado", tone: "success" },
  FAILED: { label: "Fallida", tone: "danger" },
};

/** Estado de asignación (Lead.assignmentStatus), separado de EasyBroker y del aviso al asesor. */
export function AssignmentBadge({ status }: { status: string }) {
  const meta = ASSIGNMENT[status] ?? { label: status || "—", tone: "neutral" as const };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

/** Sincronización con EasyBroker de la última asignación. Sin asignación registrada no aplica. */
export function EasyBrokerBadge({ confirmed, hasAssignment }: { confirmed: boolean; hasAssignment: boolean }) {
  if (!hasAssignment) return <span className="text-xs text-ink-400">No aplica</span>;
  return <Badge tone={confirmed ? "success" : "warning"}>{confirmed ? "Confirmado" : "Pendiente"}</Badge>;
}

/** Aviso por WhatsApp (ManyChat) al asesor de la última asignación. */
export function NoticeBadge({ notified, hasAssignment }: { notified: boolean; hasAssignment: boolean }) {
  if (!hasAssignment) return <span className="text-xs text-ink-400">No aplica</span>;
  return <Badge tone={notified ? "success" : "warning"}>{notified ? "Enviado" : "Sin confirmar"}</Badge>;
}
