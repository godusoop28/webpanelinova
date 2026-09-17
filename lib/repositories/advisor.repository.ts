import "server-only";
import type { Advisor, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AdvisorUpsertInput {
  name: string;
  email?: string | null;
  phone: string;
  easyBrokerEmail?: string | null;
  easyBrokerAgentId?: string | null;
  manyChatSubscriberId?: string | null;
  active: boolean;
  weight: number;
  dailyLimit?: number | null;
  pausedUntil?: Date | null;
  allowedProperty: boolean;
  allowedExplore: boolean;
  allowedCampaign: boolean;
  allowedTimeout: boolean;
  priority?: number | null;
  notes?: string | null;
}

export function findManyAdvisors(companyId: string, where: Prisma.AdvisorWhereInput = {}): Promise<Advisor[]> {
  return prisma.advisor.findMany({
    where: { companyId, ...where },
    orderBy: { name: "asc" },
  });
}

export function findAdvisorById(id: string): Promise<Advisor | null> {
  return prisma.advisor.findUnique({ where: { id } });
}

export function findAdvisorByEasyBrokerEmail(companyId: string, easyBrokerEmail: string): Promise<Advisor | null> {
  return prisma.advisor.findFirst({
    where: { companyId, easyBrokerEmail: { equals: easyBrokerEmail, mode: "insensitive" } },
  });
}

export function createAdvisor(companyId: string, data: AdvisorUpsertInput): Promise<Advisor> {
  return prisma.advisor.create({ data: { companyId, ...data } });
}

export function updateAdvisor(id: string, data: Partial<AdvisorUpsertInput>): Promise<Advisor> {
  return prisma.advisor.update({ where: { id }, data });
}

export function setAdvisorActive(id: string, active: boolean): Promise<Advisor> {
  return prisma.advisor.update({ where: { id }, data: { active } });
}

export function setAdvisorPausedUntil(id: string, pausedUntil: Date | null): Promise<Advisor> {
  return prisma.advisor.update({ where: { id }, data: { pausedUntil } });
}

/**
 * Upsert keyed on (companyId, easyBrokerEmail) — the migration endpoint's
 * primary dedup key (Fase 6). Advisors without an EasyBroker email can't go
 * through this path; callers fall back to a secondary key themselves.
 */
export async function upsertAdvisorByEasyBrokerEmail(
  companyId: string,
  easyBrokerEmail: string,
  data: AdvisorUpsertInput
): Promise<{ advisor: Advisor; created: boolean }> {
  const existing = await findAdvisorByEasyBrokerEmail(companyId, easyBrokerEmail);
  if (existing) {
    const advisor = await prisma.advisor.update({ where: { id: existing.id }, data });
    return { advisor, created: false };
  }
  const advisor = await createAdvisor(companyId, data);
  return { advisor, created: true };
}
