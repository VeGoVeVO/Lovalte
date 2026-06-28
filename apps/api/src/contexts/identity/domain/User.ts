import { AggregateRoot } from "../../../kernel";
import { UserId } from "./Ids";
import { Email } from "./Email";
import { PasswordHash } from "./PasswordHash";

export type UserRole = "owner" | "manager" | "staff";
export type UserStatus = "active" | "invited" | "disabled";

interface UserProps {
  tenantId: string;
  email: Email;
  passwordHash: PasswordHash;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User aggregate root.
 * Invariant: email unique within tenantId (enforced at DB + application layer).
 * Invariant: only owner may change another user's role (enforced at application layer).
 * Emits: UserActivated (when created from an invitation)
 */
export class User extends AggregateRoot<UserId> {
  private constructor(
    id: UserId,
    private readonly props: UserProps,
  ) {
    super(id);
  }

  /** Create the first owner of a new tenant. */
  static createOwner(params: { tenantId: string; email: Email; passwordHash: PasswordHash }): User {
    const id = UserId.create();
    const now = new Date();
    return new User(id, {
      tenantId: params.tenantId,
      email: params.email,
      passwordHash: params.passwordHash,
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Create a user accepted from an invitation (manager | staff). */
  static createFromInvitation(params: {
    tenantId: string;
    email: Email;
    passwordHash: PasswordHash;
    role: UserRole;
  }): User {
    const id = UserId.create();
    const now = new Date();
    const user = new User(id, {
      tenantId: params.tenantId,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    user.addEvent(
      user.makeEvent("UserActivated", {
        userId: id.value,
        tenantId: params.tenantId,
        role: params.role,
      }),
    );
    return user;
  }

  /** Reconstitute from persistence - no event emitted. */
  static reconstitute(id: string, props: UserProps): User {
    return new User(UserId.from(id), props);
  }

  /** Timing-safe password check. */
  verifyPassword(plaintext: string): boolean {
    return this.props.passwordHash.verify(plaintext);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get email(): Email {
    return this.props.email;
  }
  get role(): UserRole {
    return this.props.role;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get passwordHash(): PasswordHash {
    return this.props.passwordHash;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
