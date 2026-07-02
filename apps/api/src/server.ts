import { Pool } from "pg";
import Redis from "ioredis";
import { loadConfig } from "./config/env";
import { systemClock } from "./kernel";
import { InMemoryEventBus } from "./infrastructure/InMemoryEventBus";
import { buildApp } from "./http/app";
import { contextModules } from "./composition";
import type { Deps } from "./shared/deps";

async function main(): Promise<void> {
  try {
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env");
  } catch {
    /* no .env file - rely on the real environment */
  }
  const config = loadConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  const deps: Deps = {
    pool,
    redis,
    bus: new InMemoryEventBus(),
    clock: systemClock,
    config,
    services: {},
  };

  const app = await buildApp(deps, contextModules);
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  app.log.info(`Lovalte API listening on :${config.PORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
