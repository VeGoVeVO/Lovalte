import { DomainError, NotFoundError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import { PasswordHash } from "../domain/PasswordHash";
import { PasswordReset } from "../domain/PasswordReset";
import type { IIdentityTxRunner, IPasswordResetRepository, IUserRepository } from "./ports";

export interface ResetPasswordInput {
  token: string;
  password: string;
  hmacSecret: string;
}

export class ResetPasswordHandler {
  constructor(
    private readonly users: IUserRepository,
    private readonly resets: IPasswordResetRepository,
    private readonly txRunner: IIdentityTxRunner,
  ) {}

  async execute(input: ResetPasswordInput): Promise<Result<void>> {
    try {
      const tokenHash = PasswordReset.hashToken(input.token, input.hmacSecret);
      const reset = await this.resets.findByTokenHash(tokenHash);
      if (!reset) return err(new NotFoundError("Password reset link is invalid or expired"));

      const user = await this.users.findById(reset.userId, reset.tenantId);
      if (!user || user.status !== "active") {
        return err(new NotFoundError("Password reset link is invalid or expired"));
      }

      reset.consume();
      user.resetPassword(PasswordHash.hash(input.password));
      await this.txRunner.resetPasswordTx(reset, user);
      return ok(undefined);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
