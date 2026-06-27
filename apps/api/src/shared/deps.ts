import type { Pool } from "pg";
import type Redis from "ioredis";
import type { AppConfig } from "../config/env";
import type { DomainEventBus, Clock } from "../kernel";

/** Cross-cutting infrastructure handed to every context module at composition. */
export interface Deps {
  readonly pool: Pool;
  readonly redis: Redis;
  readonly bus: DomainEventBus;
  readonly clock: Clock;
  readonly config: AppConfig;
}
