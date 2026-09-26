import { defineConfig } from "vitest/config";
import path from "node:path";

/** Solo para **\/*.integration.ts: requiere TEST_DATABASE_URL (Postgres local de prueba, nunca producción). */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.integration.ts"],
    exclude: ["node_modules/**", ".next/**"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
