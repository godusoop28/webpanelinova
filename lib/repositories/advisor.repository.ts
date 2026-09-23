import "server-only";
import type { Advisor, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AssignmentRoute } from "@/lib/assignment-engine";

const ROUTE_FIELD: Record<AssignmentRoute, keyof Pick<Advisor, "allowedProperty" | "allowedExplore" | "allowedCampaign" | "allowedTimeout">> = {
  PROPERTY: "allowedProperty",
  EXPLORE: "allowedExplore",
  CAMPAIGN: "allowedCampaign",
  TIMEOUT: "allowedTimeout",
};

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
 * Same eligibility rule as lockEligibleAdvisorsForUpdate, without the
 * FOR UPDATE lock — for reads that only display/simulate and never write
 * (the "probar distribución" panel), so they don't hold row locks.
 */
export function findEligibleAdvisorsForRoute(
  companyId: string,
  route: AssignmentRoute,
  now: Date
): Promise<Advisor[]> {
  return prisma.advisor.findMany({
    where: {
      companyId,
      active: true,
      weight: { gt: 0 },
      [ROUTE_FIELD[route]]: true,
      OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
    },
    orderBy: { id: "asc" },
  });
}
