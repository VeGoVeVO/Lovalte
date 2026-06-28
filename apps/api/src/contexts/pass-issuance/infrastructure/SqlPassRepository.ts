import type { Pool, PoolClient } from "pg";
import { Pass } from "../domain/Pass";
import { SerialNumber } from "../domain/SerialNumber";
import { AuthenticationToken } from "../domain/AuthenticationToken";
import type { IPassRepository } from "../domain/ports";

/** Set the RLS current-tenant for the duration of the current transaction. */
async function setTenant(client: PoolClient, tenantId: string): Promise<void> {
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
}

function rowToPass(row: Record<string, unknown>): Pass {
  return Pass.reconstitute(row.id as string, {
    serialNumber: SerialNumber.from(row.serial_number as string),
    passTypeId: row.pass_type_id as string,
    memberId: row.member_id as string,
    tenantId: row.tenant_id as string,
    authToken: AuthenticationToken.fromRaw(row.authentication_token as string),
    fieldValues: JSON.parse(row.field_values as string) as [],
    voided: row.voided as boolean,
    lastUpdated: new Date(row.last_updated as string),
    version: row.version as number,
    createdAt: new Date(row.created_at as string),
  });
}

const SELECT_COLS = `
  id, tenant_id, serial_number, pass_type_id, member_id,
  authentication_token, field_values::text, voided,
  last_updated, version, created_at
`;

export class SqlPassRepository implements IPassRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string, tenantId: string): Promise<Pass | null> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM passes WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [id, tenantId],
      );
      return res.rows.length ? rowToPass(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async findBySerial(serial: string, tenantId: string): Promise<Pass | null> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM passes WHERE serial_number = $1 AND tenant_id = $2 LIMIT 1`,
        [serial, tenantId],
      );
      return res.rows.length ? rowToPass(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async findByMemberId(memberId: string, tenantId: string): Promise<Pass[]> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM passes WHERE member_id = $1 AND tenant_id = $2`,
        [memberId, tenantId],
      );
      return res.rows.map(rowToPass);
    } finally {
      client.release();
    }
  }

  async findByMemberAndType(
    memberId: string,
    passTypeId: string,
    tenantId: string,
  ): Promise<Pass | null> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM passes
         WHERE member_id = $1 AND pass_type_id = $2 AND tenant_id = $3 LIMIT 1`,
        [memberId, passTypeId, tenantId],
      );
      return res.rows.length ? rowToPass(res.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  async findByPassTypeId(passTypeId: string, tenantId: string): Promise<Pass[]> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, tenantId);
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM passes WHERE pass_type_id = $1 AND tenant_id = $2`,
        [passTypeId, tenantId],
      );
      return res.rows.map(rowToPass);
    } finally {
      client.release();
    }
  }

  async save(pass: Pass): Promise<void> {
    const client = await this.pool.connect();
    try {
      await setTenant(client, pass.tenantId);
      await client.query(
        `INSERT INTO passes
           (id, tenant_id, serial_number, pass_type_id, member_id,
            authentication_token, field_values, voided, last_updated, version, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
           field_values = EXCLUDED.field_values,
           voided       = EXCLUDED.voided,
           last_updated = EXCLUDED.last_updated,
           version      = EXCLUDED.version`,
        [
          pass.id.value,
          pass.tenantId,
          pass.serialNumber.value,
          pass.passTypeId,
          pass.memberId,
          pass.authToken.value,
          JSON.stringify(pass.fieldValues),
          pass.voided,
          pass.lastUpdated.toISOString(),
          pass.version,
          pass.createdAt.toISOString(),
        ],
      );
    } finally {
      client.release();
    }
  }
}
