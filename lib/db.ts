import "server-only";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

/**
 * Prisma 7 requires a driver adapter at runtime (schema.prisma no longer
 * carries a connection `url`). @prisma/adapter-neon wraps Neon's WebSocket
 * driver, which is what makes this safe to use from Vercel's serverless
 * functions without exhausting Postgres' connection limit the way a plain
 * TCP pool per invocation would.
 */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL no está configurada. Agrégala a .env.local para usar Postgres/Neon.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

type GlobalWithPrisma = typeof globalThis & { __inovaPrisma?: PrismaClient };
const globalForPrisma = globalThis as GlobalWithPrisma;

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseNotConfiguredError();
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

/**
 * Lazy singleton: constructing PrismaNeon opens a connection pool, so we
 * only do it the first time a query actually runs, and reuse it across hot
 * reloads (dev) and warm serverless invocations (prod) via globalThis.
 * Never construct eagerly — DATABASE_URL may legitimately be absent while
 * DATA_SOURCE=sheets, and importing this module must not crash that path.
 */
function getClient(): PrismaClient {
  if (!globalForPrisma.__inovaPrisma) {
    globalForPrisma.__inovaPrisma = createClient();
  }
  return globalForPrisma.__inovaPrisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Used by /api/health and /api/admin/readiness — never throws. */
export async function checkDatabaseConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!isDatabaseConfigured()) return { ok: false, error: "DATABASE_URL no configurada" };
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Error desconocido" };
  }
}
