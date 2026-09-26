import { defineConfig } from "vitest/config";
import path from "node:path";

/** Solo para lib/**\/*.eval.ts: llama a OpenAI y EasyBroker reales (ver lib/services/conversation-agent.eval.ts). */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.eval.ts"],
    exclude: ["node_modules/**", ".next/**"],
    fileParallelism: false,
  },
});
