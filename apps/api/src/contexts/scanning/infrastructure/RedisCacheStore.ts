import type Redis from "ioredis";
import type { ICacheStore } from "../application/ports";

/**
 * ioredis implementation of ICacheStore.
 * Wraps the two Redis guard patterns used in RedeemScanHandler:
 *   - setNx: SET key value NX EX <ttl>  (atomic, returns OK or null)
 *   - get / set: plain GET / SET EX
 */
export class RedisCacheStore implements ICacheStore {
  constructor(private readonly redis: Redis) {}

  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    // SET key value EX ttl NX - atomic: only sets if key is absent
    const result = await this.redis.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }
}
