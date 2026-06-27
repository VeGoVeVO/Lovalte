import { defineConfig } from "vitest/config";

/* Default `npm test` = fast, serviceless unit + handler tests under src/.
   The DB-backed integration suite (test/integration) runs via
   `npm run test:integration` (vitest.integration.config.ts) with containers up. */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
