/**
 * Runs standalone via `node --experimental-strip-types prisma/seed.ts`
 * (wired in prisma.config.ts's migrations.seed) — NOT through Next.js, so
 * it can't import anything tagged "server-only" (lib/db.ts, lib/company.ts
 * included). Idempotent: safe to run any number of times (Fase 5).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const COMPANY_SLUG = "century21-innova";
const COMPANY_NAME = "Century 21 Innova";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada. Agrégala a .env.local antes de sembrar.");
  }

  const adapter = new PrismaNeon({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const company = await prisma.company.upsert({
    where: { slug: COMPANY_SLUG },
    update: {},
    create: { name: COMPANY_NAME, slug: COMPANY_SLUG },
  });
  console.log(`[seed] Company lista: ${company.name} (${company.id})`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[seed] falló:", error);
  process.exit(1);
});
