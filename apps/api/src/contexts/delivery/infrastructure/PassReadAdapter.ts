import type { Pool } from "pg";
import type { IPassReadPort, PassReadDTO } from "../domain/ports";

interface PassRow {
  id: string;
  tenant_id: string;
  serial_number: string;
  pass_type_identifier: string;
  authentication_token: string;
  updated_at: Date;
  pkpass_s3_key: string | null;
}

/**
 * Read-only adapter for passes.
 * The delivery context must NOT import the pass-issuance domain; it reads the
 * shared table directly with parameterised SQL, returning a DTO.
 */
export class PassReadAdapter implements IPassReadPort {
  constructor(private readonly pool: Pool) {}

  async findBySerial(serialNumber: string): Promise<PassReadDTO | null> {
    const result = await this.pool.query<PassRow>(
      `SELECT p.id,
              p.tenant_id,
              p.serial_number,
              pt.pass_type_identifier,
              p.authentication_token,
              p.updated_at,
              p.pkpass_s3_key
       FROM passes p
       JOIN pass_types pt ON pt.id = p.pass_type_id
       WHERE p.serial_number = $1
       LIMIT 1`,
      [serialNumber],
    );
    return result.rows.length ? this._map(result.rows[0]) : null;
  }

  async findById(passId: string): Promise<PassReadDTO | null> {
    const result = await this.pool.query<PassRow>(
      `SELECT p.id,
              p.tenant_id,
              p.serial_number,
              pt.pass_type_identifier,
              p.authentication_token,
              p.updated_at,
              p.pkpass_s3_key
       FROM passes p
       JOIN pass_types pt ON pt.id = p.pass_type_id
       WHERE p.id = $1
       LIMIT 1`,
      [passId],
    );
    return result.rows.length ? this._map(result.rows[0]) : null;
  }

  private _map(row: PassRow): PassReadDTO {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      serialNumber: row.serial_number,
      passTypeIdentifier: row.pass_type_identifier,
      authenticationToken: row.authentication_token,
      updatedAt: row.updated_at,
      pkpassS3Key: row.pkpass_s3_key,
    };
  }
}
