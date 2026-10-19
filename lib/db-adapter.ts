import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Neon's WebSocket driver only speaks to Neon hosts; any other Postgres
 * (Render, local) needs a plain TCP pool. A small pool keeps serverless
 * invocations from exhausting a small instance's connection limit.
 */
export function createPrismaAdapter(connectionString: string) {
  if (new URL(connectionString).hostname.endsWith(".neon.tech")) {
    return new PrismaNeon({ connectionString });
  }
  return new PrismaPg({ connectionString, max: 3 });
}
