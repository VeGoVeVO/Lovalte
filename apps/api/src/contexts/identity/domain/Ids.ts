import { randomUUID } from "node:crypto";
import { UniqueId } from "../../../kernel";

export class TenantId extends UniqueId {
  static override create(): TenantId {
    return new TenantId(randomUUID());
  }
  static override from(value: string): TenantId {
    return new TenantId(value);
  }
}

export class UserId extends UniqueId {
  static override create(): UserId {
    return new UserId(randomUUID());
  }
  static override from(value: string): UserId {
    return new UserId(value);
  }
}

export class InvitationId extends UniqueId {
  static override create(): InvitationId {
    return new InvitationId(randomUUID());
  }
  static override from(value: string): InvitationId {
    return new InvitationId(value);
  }
}

export class PasswordResetId extends UniqueId {
  static override create(): PasswordResetId {
    return new PasswordResetId(randomUUID());
  }
  static override from(value: string): PasswordResetId {
    return new PasswordResetId(value);
  }
}
