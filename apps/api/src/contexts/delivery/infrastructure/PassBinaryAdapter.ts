import type Redis from "ioredis";
import type { IPassBinaryPort } from "../domain/ports";

/**
 * Serves the signed .pkpass buffer that the pass-issuance context signed and
 * cached in Redis under `pkpass:{serial}:{version}` (see RedisPassBufferCache).
 * Read-only shared-infrastructure access: delivery never signs, it only serves
 * what pass-issuance produced. Returns null on a miss (route replies 503 and the
 * device retries until pass-issuance has cached that version).
 */
export class PassBinaryAdapter implements IPassBinaryPort {
  constructor(private readonly redis: Redis) {}

  async get(serialNumber: string, version: number): Promise<Buffer | null> {
    const raw = await this.redis.getBuffer(`pkpass:${serialNumber}:${version}`);
    return raw ?? null;
  }
}
