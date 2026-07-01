import { DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import { PasswordReset } from "../domain/PasswordReset";
import type { IdentityEmailSender, IPasswordResetRepository, IUserRepository } from "./ports";

export interface RequestPasswordResetInput {
  email: string;
  hmacSecret: string;
  appBaseUrl: string;
}

export class RequestPasswordResetHandler {
  constructor(
    private readonly users: IUserRepository,
    private readonly resets: IPasswordResetRepository,
    private readonly email: IdentityEmailSender,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<Result<void>> {
    try {
      const normalisedEmail = input.email.toLowerCase().trim();
      const user = await this.users.findByEmailGlobal(normalisedEmail);
      if (!user || user.status !== "active") return ok(undefined);

      const { reset, rawToken } = PasswordReset.create({
        tenantId: user.tenantId,
        userId: user.id.value,
        email: user.email.value,
        hmacSecret: input.hmacSecret,
      });
      await this.resets.save(reset);

      const resetUrl = new URL("/reset-password", input.appBaseUrl);
      resetUrl.searchParams.set("token", rawToken);
      try {
        await this.email.sendPasswordResetEmail({
          to: user.email.value,
          resetUrl: resetUrl.toString(),
        });
      } catch (emailError) {
        console.error("[identity] password reset email failed:", emailError);
      }
      return ok(undefined);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
