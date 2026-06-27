import crypto from "node:crypto";
import { NotFoundError, ValidationError, DomainError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import { Email } from "../domain/Email";
import { PasswordHash } from "../domain/PasswordHash";
import { User } from "../domain/User";
import { Invitation } from "../domain/Invitation";
import type { UserRole } from "../domain/User";
import type { IInvitationRepository, IIdentityTxRunner } from "./ports";

export interface AcceptInvitationInput {
  token: string;    // raw HMAC token from the invitation link
  password: string;
  hmacSecret: string;
}

export interface AcceptInvitationOutput {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

/**
 * Command handler: accept an invitation and create a new user account.
 * Validates the HMAC token, checks expiry, creates User inside a single transaction.
 * Emits: UserActivated (pulled from User aggregate after createFromInvitation)
 */
export class AcceptInvitationHandler {
  constructor(
    private readonly invitations: IInvitationRepository,
    private readonly txRunner: IIdentityTxRunner,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: AcceptInvitationInput): Promise<Result<AcceptInvitationOutput>> {
    try {
      // Derive the stored hash from the raw token to look up the invitation
      const tokenHash = crypto
        .createHmac("sha256", input.hmacSecret)
        .update(input.token)
        .digest("hex");

      const invitation = await this.invitations.findByTokenHash(tokenHash);
      if (!invitation) {
        return err(new NotFoundError("Invitation not found or already used"));
      }

      // Verify token via timing-safe comparison (second factor vs hash in DB)
      const valid = Invitation.verifyToken(input.token, invitation.tokenHash, input.hmacSecret);
      if (!valid) {
        return err(new ValidationError("Invalid invitation token"));
      }

      // Domain invariant checks: expiry + single-use
      invitation.consume();

      const email = Email.fromStored(invitation.email);
      const passwordHash = PasswordHash.hash(input.password);
      const user = User.createFromInvitation({
        tenantId: invitation.tenantId,
        email,
        passwordHash,
        role: invitation.role,
      });

      // Persist: mark invitation used + insert user in one transaction
      await this.txRunner.acceptInvitationTx(invitation, user);

      const events = user.pullEvents();
      if (events.length > 0) await this.bus.publish(events);

      return ok({
        userId: user.id.value,
        tenantId: invitation.tenantId,
        email: email.value,
        role: user.role,
      });
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
