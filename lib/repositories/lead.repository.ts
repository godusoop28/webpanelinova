import "server-only";
import type { Lead, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface LeadFilters {
  companyId: string;
  status?: string;
  advisorId?: string;
  interestType?: string;
  origin?: string;
  from?: Date;
  to?: Date;
  search?: string;
}

export interface PaginatedLeads {
  items: Lead[];
  total: number;
  page: number;
  limit: number;
}

function buildWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { companyId: filters.companyId };
  if (filters.status) where.status = filters.status as Prisma.EnumLeadStatusFilter["equals"];
  if (filters.advisorId) where.assignedAdvisorId = filters.advisorId;
  if (filters.interestType) where.interestType = filters.interestType as Prisma.EnumLeadInterestTypeFilter["equals"];
  if (filters.origin) where.origin = { contains: filters.origin, mode: "insensitive" };
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { phone: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export async function findLeadsPaginated(
  filters: LeadFilters,
  page: number,
  limit: number
): Promise<PaginatedLeads> {
  const where = buildWhere(filters);
  const [items, total] = await prisma.$transaction([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: { assignedAdvisor: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.lead.count({ where }),
  ]);
  return { items, total, page, limit };
}

export function findLeadById(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      assignedAdvisor: true,
      assignments: { include: { advisor: true }, orderBy: { assignedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" } },
    },
  });
}

export function findLeadByRequestId(requestId: string): Promise<Lead | null> {
  return prisma.lead.findUnique({ where: { requestId } });
}

export type LeadCreateInput = Prisma.LeadUncheckedCreateInput;
export type LeadUpdateInput = Prisma.LeadUncheckedUpdateInput;

export function createLead(data: LeadCreateInput): Promise<Lead> {
  return prisma.lead.create({ data });
}

export function updateLead(id: string, data: LeadUpdateInput): Promise<Lead> {
  return prisma.lead.update({ where: { id }, data });
}
