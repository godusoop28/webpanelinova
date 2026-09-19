import "server-only";
import type { Lead, LeadAssignment, AuditLog, AssignmentMethod } from "@prisma/client";
import type { LeadView } from "@/lib/types";
import { findLeadsPaginated, findLeadById, type LeadFilters } from "@/lib/repositories/lead.repository";
import { leadStatusLabel } from "@/lib/lead-status";

export { LEAD_STATUS_LABELS, leadStatusLabel } from "@/lib/lead-status";

const DIRECT_METHODS: AssignmentMethod[] = ["DIRECT_PROPERTY_ADVISOR", "CAMPAIGN_DIRECT"];

type LeadWithRelations = Lead & {
  assignedAdvisor: { id: string; name: string; phone: string } | null;
  assignments: LeadAssignment[];
  auditLogs: AuditLog[];
};

function dbLeadToView(lead: LeadWithRelations): LeadView {
  const digits = lead.phone.replace(/\D/g, "");
  const latest = lead.assignments[0];
  return {
    id: lead.id,
    fechaHora: lead.createdAt.toISOString(),
    nombre: lead.name,
    telefono: lead.phone,
    tipoInteres: lead.route || lead.interestType,
    interestType: lead.interestType,
    datoEnviado: lead.propertyData ?? "",
    origen: lead.origin ?? "",
    ruta: lead.route ?? "",
    estado: leadStatusLabel(lead.status),
    linkWhatsappCliente: digits ? `https://wa.me/${digits}` : "",
    asesorAsignado: lead.assignedAdvisor?.name ?? "",
    asesorTelefono: lead.assignedAdvisor?.phone ?? "",
    metodoAsignacion: latest ? (DIRECT_METHODS.includes(latest.method) ? "Directa" : "Ruleta") : "",
    manyChatNotificado: latest?.manyChatNotified ?? false,
    easyBrokerConfirmado: latest?.easyBrokerConfirmed ?? false,
    error: lead.auditLogs[0]?.message ?? "",
  };
}

export interface LeadListPage {
  leads: LeadView[];
  total: number;
  page: number;
  limit: number;
}

export async function listLeadRows(filters: LeadFilters, page: number, limit: number): Promise<LeadListPage> {
  const result = await findLeadsPaginated(filters, page, limit);
  return {
    leads: result.items.map((lead) => dbLeadToView(lead as LeadWithRelations)),
    total: result.total,
    page: result.page,
    limit: result.limit,
  };
}

export interface LeadDetail {
  lead: Lead & { assignedAdvisor: { id: string; name: string; phone: string; easyBrokerEmail: string | null } | null };
  assignments: (LeadAssignment & { advisor: { id: string; name: string } })[];
  auditLogs: AuditLog[];
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const result = await findLeadById(id);
  if (!result) return null;
  const { assignments, auditLogs, ...lead } = result;
  return { lead, assignments, auditLogs } as LeadDetail;
}
