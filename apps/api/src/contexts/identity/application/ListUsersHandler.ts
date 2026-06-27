import { DomainError, ok, err } from "../../../kernel";
import type { Result } from "../../../kernel";
import type { UserRole, UserStatus } from "../domain/User";
import type { IUserRepository } from "./ports";

export interface UserDTO {
  userId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

/**
 * Query handler: list all users belonging to the calling tenant.
 * Scoped by tenantId from the auth context — never crosses tenant boundaries.
 */
export class ListUsersHandler {
  constructor(private readonly users: IUserRepository) {}

  async execute(tenantId: string): Promise<Result<UserDTO[]>> {
    try {
      const list = await this.users.findAllByTenant(tenantId);
      return ok(
        list.map((u) => ({
          userId: u.id.value,
          email: u.email.value,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
        }))
      );
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
