import { defineConfig } from "prisma/config";

/**
 * CLI-only config (migrate/generate/studio). The schema engine needs a
 * direct connection string here — this is separate from the driver adapter
 * (@prisma/adapter-neon) that lib/db.ts uses at runtime for the app itself.
 *
 * Deliberately reads `process.env.DATABASE_URL` directly (not prisma/config's
 * `env()` helper, which throws immediately if the var is unset) with a
 * placeholder fallback: `prisma generate` — wired as this project's
 * `postinstall` — never opens a real connection, so it must keep working on
 * a fresh `npm install` before DATABASE_URL exists yet. `migrate`/`db push`/
 * `studio` DO need a real value and will fail loudly on the placeholder,
 * which is the correct behavior for those.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL || "postgresql://placeholder:placeholder@localhost:5432/placeholder",
  },
  migrations: {
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
});
