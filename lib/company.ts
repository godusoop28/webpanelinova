import "server-only";
import { prisma } from "@/lib/db";

export const DEFAULT_COMPANY_SLUG = "century21-innova";
export const DEFAULT_COMPANY_NAME = "Century 21 Innova";

let cachedCompanyId: string | null = null;

/**
 * Every DB model is scoped by companyId (Fase 47: multiempresa desde ya),
 * but the panel's session (lib/dal.ts) doesn't carry one yet — there has
 * only ever been one tenant, authenticated by a single shared password.
 * This resolves Century 21 Innova's row (created by prisma/seed.ts) once
 * per process instead of hardcoding its id anywhere. When the panel grows
 * real per-company sessions, callers should take companyId from the
 * session instead of calling this.
 */
export async function getDefaultCompanyId(): Promise<string> {
  if (cachedCompanyId) return cachedCompanyId;
  const company = await prisma.company.findUnique({
    where: { slug: DEFAULT_COMPANY_SLUG },
    select: { id: true },
  });
  if (!company) {
    throw new Error(
      `No existe la Company "${DEFAULT_COMPANY_SLUG}". Ejecuta el seed primero: npx prisma db seed`
    );
  }
  cachedCompanyId = company.id;
  return company.id;
}
