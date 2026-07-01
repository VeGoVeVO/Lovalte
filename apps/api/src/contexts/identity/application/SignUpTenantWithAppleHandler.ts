import { randomBytes } from "node:crypto";
import { ConflictError, DomainError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import { Email } from "../domain/Email";
import { PasswordHash } from "../domain/PasswordHash";
import { Slug } from "../domain/Slug";
import { Tenant } from "../domain/Tenant";
import { User } from "../domain/User";
import type { IIdentityTxRunner, ITenantRepository } from "./ports";

export interface SignUpTenantWithAppleInput {
  email: string;
  businessName: string;
}

export interface SignUpTenantWithAppleOutput {
  tenantId: string;
  userId: string;
  email: string;
}

/** Register a tenant owner after Apple has verified control of the email. */
export class SignUpTenantWithAppleHandler {
  constructor(
    private readonly tenants: ITenantRepository,
    private readonly txRunner: IIdentityTxRunner,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: SignUpTenantWithAppleInput): Promise<Result<SignUpTenantWithAppleOutput>> {
    try {
      const email = Email.create(input.email);
      const slug = Slug.fromBusinessName(input.businessName);

      const existing = await this.tenants.findBySlug(slug.value);
      if (existing) {
        return err(new ConflictError(`Business slug '${slug.value}' is already taken`));
      }

      const passwordHash = PasswordHash.hash(randomBytes(32).toString("hex"));
      const tenant = Tenant.create({ name: input.businessName, slug });
      const owner = User.createOwner({
        tenantId: tenant.id.value,
        email,
        passwordHash,
      });

      await this.txRunner.signUpTx(tenant, owner);

      const events = [...tenant.pullEvents(), ...owner.pullEvents()];
      if (events.length > 0) await this.bus.publish(events);

      return ok({
        tenantId: tenant.id.value,
        userId: owner.id.value,
        email: email.value,
      });
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
  }
}
