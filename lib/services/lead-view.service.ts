import "server-only";
import type { Lead, LeadAssignment, AuditLog, AssignmentMethod } from "@prisma/client";
import type { LeadView } from "@/lib/types";
import { findLeadsPaginated, findLeadById, type LeadFilters } from "@/lib/repositories/lead.repository";
import { leadStatusLabel } from "@/lib/lead-status";
import { prisma } from "@/lib/db";

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
    assignmentStatus: lead.assignmentStatus,
    propiedadId: lead.easyBrokerPropertyId ?? "",
    tieneAsignacion: Boolean(latest),
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

/** Conteos globales para las tarjetas de Leads (misma definición de "pendiente" que los reportes). */
export async function leadStatusCounts(companyId: string) {
  const [groups, assigned] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
    prisma.lead.count({ where: { companyId, assignedAdvisorId: { not: null } } }),
  ]);
  const total = groups.reduce((sum, g) => sum + g._count._all, 0);
  const failed = groups.find((g) => g.status === "FAILED")?._count._all ?? 0;
  const pending = groups.filter((g) => g.status !== "COMPLETED" && g.status !== "FAILED").reduce((sum, g) => sum + g._count._all, 0);
  return { total, pending, assigned, failed };
}

/** Opciones reales para los filtros de Leads. */
export async function leadFilterOptions(companyId: string) {
  const [origins, advisors] = await Promise.all([
    prisma.lead.groupBy({ by: ["origin"], where: { companyId, origin: { not: null } }, _count: { _all: true }, orderBy: { _count: { origin: "desc" } } }),
    prisma.advisor.findMany({ where: { companyId }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    origins: origins.map((o) => o.origin?.trim()).filter((o): o is string => Boolean(o)),
    advisors,
  };
}

/** Títulos del índice local de EasyBroker para mostrar el nombre de la propiedad junto a su código. */
export async function propertyTitles(companyId: string, publicIds: string[]) {
  const ids = [...new Set(publicIds.filter(Boolean))];
  if (ids.length === 0) return new Map<string, string>();
  const rows = await prisma.propertyCacheEntry.findMany({ where: { companyId, publicId: { in: ids } }, select: { publicId: true, title: true } });
  return new Map(rows.map((row) => [row.publicId, row.title]));
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
