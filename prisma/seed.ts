/**
 * Runs standalone via `node --experimental-strip-types prisma/seed.ts`
 * (wired in prisma.config.ts's migrations.seed) — NOT through Next.js, so
 * it can't import anything tagged "server-only" (lib/db.ts, lib/company.ts,
 * lib/services/user.service.ts included). Idempotent: safe to run any
 * number of times.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import bcrypt from "bcryptjs";

const COMPANY_SLUG = "century21-innova";
const COMPANY_NAME = "Century 21 Innova";
const BCRYPT_ROUNDS = 10;

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

  const existingUsers = await prisma.user.count({ where: { companyId: company.id } });
  if (existingUsers > 0) {
    console.log(`[seed] Ya hay ${existingUsers} usuario(s); no se crea un admin nuevo.`);
  } else {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!email || !password) {
      console.warn(
        "[seed] No hay usuarios y SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD no están definidas — " +
          "no se puede crear el primer ADMIN. Defínelas y vuelve a correr el seed."
      );
    } else {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const admin = await prisma.user.create({
        data: {
          companyId: company.id,
          name: "Administrador",
          email: email.trim().toLowerCase(),
          passwordHash,
          role: "ADMIN",
          active: true,
        },
      });
      console.log(`[seed] Usuario ADMIN creado: ${admin.email}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("[seed] falló:", error);
  process.exit(1);
});
