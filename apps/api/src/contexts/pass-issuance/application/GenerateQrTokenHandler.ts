import { createHmac, randomBytes } from "node:crypto";
import type Redis from "ioredis";
import { NotFoundError, type Result, ok, err } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import type { IPassRepository } from "../domain/ports";

export interface GenerateQrTokenCommand {
  passId: string;
  tenantId: string;
  /** How long the QR nonce is valid in Redis (default: 300 s = 5 min). */
  ttlSeconds?: number;
}

export interface GenerateQrTokenDto {
  token: string;
  expiresAt: string; // ISO 8601
}

const DEFAULT_TTL_SECONDS = 300;

/**
 * GenerateQrTokenHandler
 *
 * Mints a compact HMAC-SHA256 token: base64url(payload).base64url(sig).
 *
 * Token claims: { passId, tenantId, nonce, iat }
 * The nonce is stored in Redis with a TTL so scanners can verify single-use.
 */
export class GenerateQrTokenHandler {
  constructor(
    private readonly passes: IPassRepository,
    private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  async execute(cmd: GenerateQrTokenCommand): Promise<Result<GenerateQrTokenDto>> {
    const pass = await this.passes.findById(cmd.passId, cmd.tenantId);
    if (!pass) return err(new NotFoundError("Pass not found"));

    const ttl   = cmd.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const nonce = randomBytes(16).toString("hex");
    const iat   = Math.floor(Date.now() / 1000);
    const exp   = iat + ttl;

    const payload = JSON.stringify({
      passId:   pass.id.value,
      tenantId: cmd.tenantId,
      nonce,
      iat,
    });

    const body  = Buffer.from(payload).toString("base64url");
    const sig   = createHmac("sha256", this.config.QR_TOKEN_SECRET)
      .update(body)
      .digest("base64url");
    const token = `${body}.${sig}`;

    // Store nonce in Redis — single-use guard for the scanning context
    await this.redis.set(`qr:nonce:${nonce}`, pass.id.value, "EX", ttl);

    return ok({
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
    });
  }
}
