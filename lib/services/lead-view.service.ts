import "server-only";
import type { Lead, LeadAssignment, AuditLog, AssignmentMethod } from "@prisma/client";
import type { LeadView } from "@/lib/types";
import type { LeadLike } from "@/lib/metrics";
import { prisma } from "@/lib/db";
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

/**
 * Dashboard KPIs reuse lib/metrics.ts's computeLeadMetrics unchanged — this
 * just feeds it DB-shaped rows. Bounded by `limit` rather than paginated
 * end-to-end like /leads, since a date-range aggregation over a moderate
 * window is a different access pattern than the leads list.
 */
export async function listLeadMetricsRows(companyId: string, from: Date, to: Date, limit = 5000): Promise<LeadLike[]> {
  const leads = await prisma.lead.findMany({
    where: { companyId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { assignments: { take: 1, orderBy: { assignedAt: "desc" } } },
  });

  return leads.map((lead) => {
    const latest = lead.assignments[0];
    const isDirect = latest ? DIRECT_METHODS.includes(latest.method) : false;
    return {
      fechaHora: lead.createdAt.toISOString(),
      telefono: lead.phone,
      tipoInteres: lead.route || lead.interestType,
      origen: lead.origin ?? "",
      estadoEasyBroker: lead.status,
      tipoAsignacion: latest ? (isDirect ? "Exclusiva" : "Rotación") : "",
      estadoEnvioAsesor: latest ? (latest.manyChatNotified ? "Enviado" : "Pendiente") : "",
    };
  });
}

export interface LeadReportRow {
  fechaHora: string;
  origen: string;
  asesorAsignado: string;
  estadoEnvio: "enviado" | "pendiente" | "error";
}

/** Fase 26: reportes por asesor/origen/periodo, todo desde Postgres. */
export async function listLeadReportRows(companyId: string, from: Date, to: Date, limit = 5000): Promise<LeadReportRow[]> {
  const leads = await prisma.lead.findMany({
    where: { companyId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      assignedAdvisor: { select: { name: true } },
      assignments: { take: 1, orderBy: { assignedAt: "desc" } },
    },
  });

  return leads.map((lead) => {
    const latest = lead.assignments[0];
    let estadoEnvio: "enviado" | "pendiente" | "error" = "pendiente";
    if (lead.status === "FAILED") estadoEnvio = "error";
    else if (latest?.manyChatNotified) estadoEnvio = "enviado";
    return {
      fechaHora: lead.createdAt.toISOString(),
      origen: lead.origin ?? "",
      asesorAsignado: lead.assignedAdvisor?.name ?? "",
      estadoEnvio,
    };
  });
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const result = await findLeadById(id);
  if (!result) return null;
  const { assignments, auditLogs, ...lead } = result;
  return { lead, assignments, auditLogs } as LeadDetail;
}
