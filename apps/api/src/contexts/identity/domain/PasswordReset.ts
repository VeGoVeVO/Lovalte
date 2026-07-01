import crypto from "node:crypto";
import { Entity, ValidationError } from "../../../kernel";
import { PasswordResetId } from "./Ids";

interface PasswordResetProps {
  tenantId: string;
  userId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Single-use password reset request. The raw token is only returned at creation
 * time for email delivery; persistence stores an HMAC hash only.
 */
export class PasswordReset extends Entity<PasswordResetId> {
  static readonly TTL_MS = 60 * 60 * 1000;

  private _usedAt: Date | null;

  private constructor(
    id: PasswordResetId,
    private readonly props: PasswordResetProps,
  ) {
    super(id);
    this._usedAt = props.usedAt;
  }

  static create(params: { tenantId: string; userId: string; email: string; hmacSecret: string }): {
    reset: PasswordReset;
    rawToken: string;
  } {
    const id = PasswordResetId.create();
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = PasswordReset.hashToken(rawToken, params.hmacSecret);
    const now = new Date();
    return {
      reset: new PasswordReset(id, {
        tenantId: params.tenantId,
        userId: params.userId,
        email: params.email.toLowerCase().trim(),
        tokenHash,
        expiresAt: new Date(now.getTime() + PasswordReset.TTL_MS),
        usedAt: null,
        createdAt: now,
      }),
      rawToken,
    };
  }

  static reconstitute(id: string, props: PasswordResetProps): PasswordReset {
    return new PasswordReset(PasswordResetId.from(id), props);
  }

  static hashToken(rawToken: string, hmacSecret: string): string {
    return crypto.createHmac("sha256", hmacSecret).update(rawToken).digest("hex");
  }

  consume(): void {
    if (this._usedAt) throw new ValidationError("Password reset link has already been used");
    if (new Date() > this.props.expiresAt)
      throw new ValidationError("Password reset link has expired");
    this._usedAt = new Date();
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get userId(): string {
    return this.props.userId;
  }
  get email(): string {
    return this.props.email;
  }
  get tokenHash(): string {
    return this.props.tokenHash;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get usedAt(): Date | null {
    return this._usedAt;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
