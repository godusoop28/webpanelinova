import "server-only";
import type { Lead, LeadAssignment, AuditLog } from "@prisma/client";
import type { LeadRow } from "@/lib/google-sheets";
import type { LeadLike } from "@/lib/metrics";
import { prisma } from "@/lib/db";
import { findLeadsPaginated, findLeadById, type LeadFilters } from "@/lib/repositories/lead.repository";

type LeadWithAdvisor = Lead & { assignedAdvisor: { id: string; name: string; phone: string } | null };

/** Adapts a Postgres Lead into the legacy LeadRow shape /leads already renders (Fase 64). */
function dbLeadToRow(lead: LeadWithAdvisor): LeadRow {
  const digits = lead.phone.replace(/\D/g, "");
  return {
    rowNumber: 0,
    fechaHora: lead.createdAt.toISOString(),
    nombre: lead.name,
    telefono: lead.phone,
    tipoInteres: lead.route || lead.interestType,
    datoEnviado: lead.propertyData ?? "",
    origen: lead.origin ?? "",
    ruta: lead.route ?? "",
    estadoEasyBroker: lead.status,
    linkWhatsappCliente: digits ? `https://wa.me/${digits}` : "",
    asesorAsignado: lead.assignedAdvisor?.name ?? "",
    observaciones: "",
    idAsesorAsignado: lead.assignedAdvisorId ?? "",
    whatsappAsesorAsignado: lead.assignedAdvisor?.phone ?? "",
    fechaAsignacion: "",
    tipoAsignacion: "",
    estadoEnvioAsesor: "",
    observacionAsignacion: "",
  };
}

export interface LeadListPage {
  leads: (LeadRow & { id: string })[];
  total: number;
  page: number;
  limit: number;
}

export async function listLeadRows(filters: LeadFilters, page: number, limit: number): Promise<LeadListPage> {
  const result = await findLeadsPaginated(filters, page, limit);
  return {
    leads: result.items.map((lead) => ({ ...dbLeadToRow(lead as LeadWithAdvisor), id: lead.id })),
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
 * Fase 35: dashboard KPIs reuse lib/metrics.ts's computeLeadMetrics
 * unchanged — this just feeds it DB-shaped rows instead of Sheets rows.
 * Bounded by `limit` (not paginated end-to-end like /leads) because a
 * date-range aggregation over a moderate window is exactly the case Fase
 * 40's "don't load thousands of leads in one request" is warning about
 * avoiding for the *list* UI, not for this kind of bounded read.
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
    const isDirect = latest?.method === "DIRECT_PROPERTY_ADVISOR" || latest?.method === "CAMPAIGN_DIRECT";
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

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  const lead = await findLeadById(id);
  if (!lead) return null;
  return lead as unknown as LeadDetail;
}
