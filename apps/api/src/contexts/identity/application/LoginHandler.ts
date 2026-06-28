import { UnauthorizedError, DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { UserRole } from "../domain/User";
import type { ITenantRepository, IUserRepository } from "./ports";

export interface LoginInput {
  email: string;
  password: string;
  slug?: string; // optional: disambiguates if the same email exists in >1 tenant
}

export interface LoginOutput {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
}

/**
 * Command handler: authenticate a dashboard user.
 * Locates tenant by slug, then verifies email + scrypt password.
 * The route layer calls setSessionCookie on success.
 */
export class LoginHandler {
  constructor(
    private readonly tenants: ITenantRepository,
    private readonly users: IUserRepository,
  ) {}

  async execute(input: LoginInput): Promise<Result<LoginOutput>> {
    try {
      const email = input.email.toLowerCase().trim();
      const slug = input.slug?.trim();

      // Resolve the user: by tenant slug when given, else globally by email.
      const user = slug
        ? await (async () => {
            const t = await this.tenants.findBySlug(slug);
            return t ? this.users.findByEmail(t.id.value, email) : null;
          })()
        : await this.users.findByEmailGlobal(email);
      if (!user) {
        // Generic message to prevent user enumeration
        return err(new UnauthorizedError("Invalid credentials"));
      }

      const tenant = await this.tenants.findById(user.tenantId);
      if (!tenant) {
        return err(new UnauthorizedError("Invalid credentials"));
      }
      if (tenant.status !== "active") {
        return err(new UnauthorizedError("Tenant account is not active"));
      }

      if (user.status !== "active") {
        return err(new UnauthorizedError("User account is not active"));
      }

      const valid = user.verifyPassword(input.password);
      if (!valid) {
        return err(new UnauthorizedError("Invalid credentials"));
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
