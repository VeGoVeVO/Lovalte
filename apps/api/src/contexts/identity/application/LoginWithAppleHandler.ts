import { UnauthorizedError, DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { UserRole } from "../domain/User";
import type { ITenantRepository, IUserRepository } from "./ports";

export interface LoginWithAppleInput {
  email: string;
  slug?: string;
}

export interface LoginWithAppleOutput {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

/** Authenticate an existing user after Apple has verified control of the email. */
export class LoginWithAppleHandler {
  constructor(
    private readonly tenants: ITenantRepository,
    private readonly users: IUserRepository,
  ) {}

  async execute(input: LoginWithAppleInput): Promise<Result<LoginWithAppleOutput>> {
    try {
      const email = input.email.toLowerCase().trim();
      const slug = input.slug?.trim();

      const user = slug
        ? await (async () => {
            const t = await this.tenants.findBySlug(slug);
            return t ? this.users.findByEmail(t.id.value, email) : null;
          })()
        : await this.users.findByEmailGlobal(email);
      if (!user) {
        return err(new UnauthorizedError("No Lovalte account is linked to this Apple ID"));
      }

      const tenant = await this.tenants.findById(user.tenantId);
      if (!tenant) return err(new UnauthorizedError("Invalid credentials"));
      if (tenant.status !== "active") {
        return err(new UnauthorizedError("Tenant account is not active"));
      }
      if (user.status !== "active") {
        return err(new UnauthorizedError("User account is not active"));
      }

      return ok({
        userId: user.id.value,
        tenantId: tenant.id.value,
        email: user.email.value,
        role: user.role,
      });
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
