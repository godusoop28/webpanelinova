import "server-only";
import type { Lead, LeadAssignment, AuditLog, AssignmentMethod, IntegrationJob } from "@prisma/client";
import type { LeadView } from "@/lib/types";
import { findLeadsPaginated, findLeadById, type LeadFilters } from "@/lib/repositories/lead.repository";
import { leadStatusLabel } from "@/lib/lead-status";
import { prisma } from "@/lib/db";
import { currentIntegrationNotice, noticeTarget, uncoveredAuditError, type IntegrationNotice } from "@/lib/integration-notice";

export { LEAD_STATUS_LABELS, leadStatusLabel } from "@/lib/lead-status";

const DIRECT_METHODS: AssignmentMethod[] = ["DIRECT_PROPERTY_ADVISOR", "CAMPAIGN_DIRECT"];

type NoticeJobRow = Pick<IntegrationJob, "id" | "type" | "status" | "attempts" | "lastError" | "errorKind" | "errorCode" | "lastAttemptAt" | "nextRetryAt" | "createdAt" | "payload">;

type LeadWithRelations = Lead & {
  assignedAdvisor: { id: string; name: string; phone: string; manyChatSubscriberId: string | null } | null;
  assignments: LeadAssignment[];
  auditLogs: AuditLog[];
  integrationJobs: NoticeJobRow[];
};

/**
 * Aviso vigente del lead según el estado real de sus trabajos. Si el aviso
 * al asesor ya quedó confirmado en la asignación, un MANYCHAT_FLOW antiguo
 * deja de mostrarse como pendiente (el historial lo conserva).
 */
export function leadIntegrationNotice(
  jobs: NoticeJobRow[],
  advisor: { name: string; manyChatSubscriberId: string | null } | null,
  assignmentNotified: boolean
): IntegrationNotice | null {
  return currentIntegrationNotice(jobs, {
    targetFor: (job) => noticeTarget(job as NoticeJobRow, advisor),
    confirmedTypes: assignmentNotified ? ["MANYCHAT_FLOW"] : [],
  });
}

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
    error: uncoveredAuditError(lead.auditLogs, lead.integrationJobs, latest?.manyChatNotified ?? false),
    aviso: leadIntegrationNotice(lead.integrationJobs, lead.assignedAdvisor, latest?.manyChatNotified ?? false),
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
  /** Aviso vigente de integraciones (null si todo está confirmado). */
  notice: IntegrationNotice | null;
  /** Historial de acciones de integración, sin payload. */
  jobs: (Omit<NoticeJobRow, "payload"> & { target: string })[];
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const result = await findLeadById(id);
  if (!result) return null;
  const { assignments, auditLogs, integrationJobs, ...lead } = result;
  const advisor = lead.assignedAdvisor ? { name: lead.assignedAdvisor.name, manyChatSubscriberId: lead.assignedAdvisor.manyChatSubscriberId } : null;
  const notified = assignments[0]?.manyChatNotified ?? false;
  return {
    lead,
    assignments,
    auditLogs,
    notice: leadIntegrationNotice(integrationJobs, advisor, notified),
    jobs: integrationJobs.map(({ payload, ...job }) => ({ ...job, target: noticeTarget({ type: job.type, payload }, advisor) })),
  } as LeadDetail;
}
