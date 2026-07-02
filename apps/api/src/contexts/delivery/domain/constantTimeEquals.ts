import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string equality, via SHA-256 digest comparison so both inputs
 * are hashed to the same fixed length before `timingSafeEqual` (which throws
 * on mismatched buffer lengths). Used for PassKit auth-token and
 * passTypeIdentifier checks so response timing cannot leak how much of a
 * guessed value matched.
 */
export function constantTimeEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}
