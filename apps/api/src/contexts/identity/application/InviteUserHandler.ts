import { ConflictError, DomainError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import { Invitation } from "../domain/Invitation";
import type { InvitationRole } from "../domain/Invitation";
import type { IUserRepository, IInvitationRepository } from "./ports";

export interface InviteUserInput {
  tenantId: string;
  email: string;
  role: InvitationRole;
  invitedBy: string; // userId of the caller
  hmacSecret: string;
}

export interface InviteUserOutput {
  invitationId: string;
  email: string;
  role: InvitationRole;
  expiresAt: string;
  /** Raw token returned for delivery (email, etc.). Treat as a secret. */
  token: string;
}

/**
 * Command handler: invite a new staff or manager user.
 * Requires caller to be owner or manager (enforced in presentation layer via requireAuth).
 * Emits: UserInvited
 */
export class InviteUserHandler {
  constructor(
    private readonly users: IUserRepository,
    private readonly invitations: IInvitationRepository,
    private readonly bus: DomainEventBus
  ) {}

  async execute(input: InviteUserInput): Promise<Result<InviteUserOutput>> {
    try {
      const normalisedEmail = input.email.toLowerCase().trim();

      // Prevent invite if user already exists in this tenant
      const existing = await this.users.findByEmail(input.tenantId, normalisedEmail);
      if (existing) {
        return err(new ConflictError("A user with this email already exists in the tenant"));
      }

      // Prevent duplicate pending invite
      const pendingInvite = await this.invitations.findPendingByEmail(
        input.tenantId,
        normalisedEmail
      );
      if (pendingInvite) {
        return err(new ConflictError("A pending invitation for this email already exists"));
      }

      const { invitation, rawToken } = Invitation.create({
        tenantId: input.tenantId,
        email: normalisedEmail,
        role: input.role,
        invitedBy: input.invitedBy,
        hmacSecret: input.hmacSecret,
      });

      await this.invitations.save(invitation);

      await this.bus.publish([
        {
          name: "UserInvited",
          occurredAt: new Date(),
          aggregateId: invitation.id.value,
          payload: {
            invitationId: invitation.id.value,
            tenantId: input.tenantId,
            email: normalisedEmail,
            role: input.role,
            invitedBy: input.invitedBy,
            expiresAt: invitation.expiresAt.toISOString(),
          },
        },
      ]);

      return ok({
        invitationId: invitation.id.value,
        email: normalisedEmail,
        role: input.role,
        expiresAt: invitation.expiresAt.toISOString(),
        token: rawToken,
      });
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
