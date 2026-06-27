import crypto from "node:crypto";
import { Entity, ValidationError } from "../../../kernel";
import { InvitationId } from "./Ids";
import type { UserRole } from "./User";

export type InvitationRole = Exclude<UserRole, "owner">; // "manager" | "staff"

interface InvitationProps {
  tenantId: string;
  email: string;
  role: InvitationRole;
  tokenHash: string;  // HMAC-SHA256 hex of the rawToken
  expiresAt: Date;
  invitedBy: string;  // UserId
  usedAt: Date | null;
  createdAt: Date;
}

/**
 * Invitation entity (not an aggregate — lives inside identity context boundary).
 * Created by InviteUserHandler; consumed by AcceptInvitationHandler.
 * Token is a single-use HMAC-SHA256 with 48h TTL.
 */
export class Invitation extends Entity<InvitationId> {
  static readonly TTL_MS = 48 * 60 * 60 * 1000;

  private _usedAt: Date | null;

  private constructor(id: InvitationId, private readonly props: InvitationProps) {
    super(id);
    this._usedAt = props.usedAt;
  }

  /**
   * Factory — returns the invitation and the raw (unhashed) token.
   * Caller is responsible for delivering rawToken to the invitee (email etc.).
   */
  static create(params: {
    tenantId: string;
    email: string;
    role: InvitationRole;
    invitedBy: string;
    hmacSecret: string;
  }): { invitation: Invitation; rawToken: string } {
    const id = InvitationId.create();
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHmac("sha256", params.hmacSecret)
      .update(rawToken)
      .digest("hex");
    const now = new Date();
    const invitation = new Invitation(id, {
      tenantId: params.tenantId,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      tokenHash,
      expiresAt: new Date(now.getTime() + Invitation.TTL_MS),
      invitedBy: params.invitedBy,
      usedAt: null,
      createdAt: now,
    });
    return { invitation, rawToken };
  }

  /** Reconstitute from persistence. */
  static reconstitute(id: string, props: InvitationProps): Invitation {
    return new Invitation(InvitationId.from(id), props);
  }

  /** Timing-safe HMAC verification of a raw token against the stored hash. */
  static verifyToken(rawToken: string, storedHash: string, hmacSecret: string): boolean {
    const expected = crypto
      .createHmac("sha256", hmacSecret)
      .update(rawToken)
      .digest("hex");
    if (expected.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(storedHash, "hex"));
  }

  /**
   * Mark invitation as consumed. Throws ValidationError if already used or expired.
   * Persistence of usedAt is handled by the TxRunner.
   */
  consume(): void {
    if (this._usedAt) throw new ValidationError("Invitation has already been used");
    if (new Date() > this.props.expiresAt) throw new ValidationError("Invitation has expired");
    this._usedAt = new Date();
  }

  get tenantId(): string { return this.props.tenantId; }
  get email(): string { return this.props.email; }
  get role(): InvitationRole { return this.props.role; }
  get tokenHash(): string { return this.props.tokenHash; }
  get expiresAt(): Date { return this.props.expiresAt; }
  get invitedBy(): string { return this.props.invitedBy; }
  get usedAt(): Date | null { return this._usedAt; }
  get createdAt(): Date { return this.props.createdAt; }
  get isExpired(): boolean { return new Date() > this.props.expiresAt; }
  get isUsed(): boolean { return this._usedAt !== null; }
}
