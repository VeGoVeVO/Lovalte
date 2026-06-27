import { defineConfig } from "vitest/config";

/**
 * Vitest config for API integration tests.
 *
 * Run with:  npm run test:integration
 *
 * Requirements: Postgres + Redis must be reachable. Set DATABASE_URL and
 * REDIS_URL (plus the other env vars from src/config/env.ts) either via .env
 * at the project root or in the shell environment before running.
 *
 * Tests share a single app instance and therefore a single DB + Redis
 * connection pool.  They are intentionally serial (singleFork) so that
 * ordered state - e.g. signup before scan - is deterministic.
 */
export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // run all tests in one process, in declaration order
      },
    },
    reporters: ["verbose"],
  },
});
