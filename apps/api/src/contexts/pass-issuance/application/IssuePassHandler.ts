import { randomBytes } from "node:crypto";
import { createHmac } from "node:crypto";
import type Redis from "ioredis";
import { NotFoundError, ConflictError, type Result, ok, err, type Clock } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import { Pass } from "../domain/Pass";
import { SerialNumber } from "../domain/SerialNumber";
import { AuthenticationToken } from "../domain/AuthenticationToken";
import { PassDocumentBuilder } from "../domain/PassDocumentBuilder";
import type {
  IPassRepository,
  IPassTemplateRepository,
  IPassSigningPort,
  IPassBufferCache,
  PassFieldValueInput,
} from "../domain/ports";

export interface IssuePassCommand {
  memberId: string;
  passTypeId: string;
  tenantId: string;
  fieldValues?: PassFieldValueInput[];
}

export interface IssuePassDto {
  passId: string;
  serialNumber: string;
  memberId: string;
  createdAt: Date;
}

/** QR nonce TTL: 10 years (pass lifetime; nonce is the real single-use guard). */
const QR_NONCE_TTL_SECONDS = 315_360_000;

/** Build a compact HMAC-SHA256 QR token: base64url(payload).base64url(sig). */
function buildQrToken(
  passId: string,
  tenantId: string,
  nonce: string,
  secret: string,
): string {
  const iat     = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ passId, tenantId, nonce, iat });
  const body    = Buffer.from(payload).toString("base64url");
  const sig     = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * IssuePassHandler
 *
 * Idempotent: returns existing pass for same (memberId, passTypeId, tenantId).
 * Signing via IPassSigningPort: throws DomainError if Apple certs not configured.
 */
export class IssuePassHandler {
  private readonly builder = new PassDocumentBuilder();

  constructor(
    private readonly passes: IPassRepository,
    private readonly templates: IPassTemplateRepository,
    private readonly signer: IPassSigningPort,
    private readonly cache: IPassBufferCache,
    private readonly redis: Redis,
    private readonly clock: Clock,
    private readonly config: AppConfig,
  ) {}

  async execute(cmd: IssuePassCommand): Promise<Result<IssuePassDto>> {
    // Idempotency: return existing pass if already issued for this member+template
    const existing = await this.passes.findByMemberAndType(
      cmd.memberId, cmd.passTypeId, cmd.tenantId,
    );
    if (existing) {
      return ok({
        passId:       existing.id.value,
        serialNumber: existing.serialNumber.value,
        memberId:     existing.memberId,
        createdAt:    existing.createdAt,
      });
    }

    const template = await this.templates.findById(cmd.passTypeId, cmd.tenantId);
    if (!template) {
      return err(new NotFoundError("Pass template not found. Publish a card template first."));
    }
    if (template.tenantId !== cmd.tenantId) {
      return err(new ConflictError("Template belongs to a different tenant"));
    }

    // Mint identity
    const serial    = SerialNumber.mint();
    const authToken = AuthenticationToken.fromRaw(randomBytes(32).toString("hex"));
    const now       = this.clock.now();

    // Generate QR nonce (token is built after pass.id is known below)
    const nonce = randomBytes(16).toString("hex");

    const fieldValues = (cmd.fieldValues ?? []).map(fv => ({ ...fv }));
    const pass = Pass.issue({
      passTypeId:   cmd.passTypeId,
      memberId:     cmd.memberId,
      tenantId:     cmd.tenantId,
      serialNumber: serial,
      authToken,
      fieldValues,
      now,
    });

    // Build QR token now that we have the real passId
    const qrMessage = buildQrToken(
      pass.id.value, cmd.tenantId, nonce, this.config.QR_TOKEN_SECRET,
    );

    // Store nonce in Redis (single-use guard; TTL = pass lifetime)
    await this.redis.set(
      `qr:nonce:${nonce}`, pass.id.value, "EX", QR_NONCE_TTL_SECONDS,
    );

    // Build + sign pass document (throws DomainError if certs not configured)
    const passJson = this.builder.build(pass, template, qrMessage);
    const buffer   = await this.signer.sign(
      passJson as unknown as Record<string, unknown>,
      template.imageAssetRefs,
    );

    // Cache signed buffer keyed by (serial, version)
    await this.cache.put(serial.value, pass.version, buffer);

    // Persist pass
    await this.passes.save(pass);

    return ok({
      passId:       pass.id.value,
      serialNumber: serial.value,
      memberId:     cmd.memberId,
      createdAt:    now,
    });
  }
}
