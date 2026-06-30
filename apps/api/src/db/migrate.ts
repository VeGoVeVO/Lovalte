import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { loadConfig } from "../config/env";

/** Forward-only migration runner. Applies pending src/db/migrations/*.sql in
 *  filename order, each in its own transaction, tracked in `_migrations`. */
async function migrate(): Promise<void> {
  try {
    (process as unknown as { loadEnvFile?: (p: string) => void }).loadEnvFile?.(".env");
  } catch {
    /* no .env - rely on real env */
  }
  const cfg = loadConfig();
  const pool = new Pool({ connectionString: cfg.DATABASE_URL });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
  const dir = join(__dirname, "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const appliedRows = await pool.query<{ id: string }>("SELECT id FROM _migrations");
  const applied = new Set(appliedRows.rows.map((r) => r.id));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO _migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
}

migrate()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
