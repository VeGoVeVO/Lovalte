import crypto from "node:crypto";
import { ValueObject, ValidationError } from "../../../kernel";

interface PasswordHashProps { encoded: string } // "saltHex:hashHex"

/**
 * Scrypt-based password hash value object.
 * Format: "<16-byte-salt-hex>:<64-byte-hash-hex>"
 * Pure crypto — no I/O.
 */
export class PasswordHash extends ValueObject<PasswordHashProps> {
  static readonly KEYLEN = 64;
  static readonly SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

  /** Hash a plaintext password. Returns a new PasswordHash. */
  static hash(plaintext: string): PasswordHash {
    if (!plaintext || plaintext.length < 1) {
      throw new ValidationError("Password cannot be empty");
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto
      .scryptSync(plaintext, salt, PasswordHash.KEYLEN, PasswordHash.SCRYPT_PARAMS)
      .toString("hex");
    return new PasswordHash({ encoded: `${salt}:${hash}` });
  }

  /** Reconstitute from a stored encoded string. */
  static fromEncoded(encoded: string): PasswordHash {
    const parts = encoded.split(":");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ValidationError("Invalid password hash format");
    }
    return new PasswordHash({ encoded });
  }

  /** Timing-safe password verification. */
  verify(plaintext: string): boolean {
    const [salt, stored] = this.props.encoded.split(":");
    if (!salt || !stored) return false;
    try {
      const candidate = crypto
        .scryptSync(plaintext, salt, PasswordHash.KEYLEN, PasswordHash.SCRYPT_PARAMS)
        .toString("hex");
      if (candidate.length !== stored.length) return false;
      return crypto.timingSafeEqual(
        Buffer.from(candidate, "hex"),
        Buffer.from(stored, "hex")
      );
    } catch {
      return false;
    }
  }

  get encoded(): string { return this.props.encoded; }
}
