import type Redis from "ioredis";
import type { IPassBufferCache } from "../domain/ports";

/** TTL for cached pkpass buffers (24 hours). */
const CACHE_TTL_SECONDS = 86_400;

/**
 * Redis-backed pass buffer cache.
 *
 * Key pattern: `pkpass:{serial}:{version}`
 * Value: raw pkpass binary stored as a Buffer (ioredis handles Buffer round-trip).
 *
 * Old versions auto-expire via TTL; new versions get their own key so the old
 * cached buffer is served until it expires or the device polls the updated version.
 */
export class RedisPassBufferCache implements IPassBufferCache {
  constructor(private readonly redis: Redis) {}

  async get(serial: string, version: number): Promise<Buffer | null> {
    const raw = await this.redis.getBuffer(`pkpass:${serial}:${version}`);
    return raw ?? null;
  }

  async put(serial: string, version: number, buffer: Buffer): Promise<void> {
    await this.redis.set(
      `pkpass:${serial}:${version}`,
      buffer,
      "EX",
      CACHE_TTL_SECONDS,
    );
  }
}
