import { Pool, PoolClient } from "pg";
import type { AppConfig } from "../config/env";

export function createPool(cfg: AppConfig): Pool {
  return new Pool({ connectionString: cfg.DATABASE_URL, max: 10 });
}

/** Run `fn` inside a single transaction - used for one-aggregate-per-tx writes. */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
