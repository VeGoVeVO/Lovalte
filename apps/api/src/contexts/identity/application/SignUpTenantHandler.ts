import { ConflictError, DomainError, ok, err } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import { Email } from "../domain/Email";
import { Slug } from "../domain/Slug";
import { PasswordHash } from "../domain/PasswordHash";
import { Tenant } from "../domain/Tenant";
import { User } from "../domain/User";
import type { ITenantRepository, IIdentityTxRunner } from "./ports";

export interface SignUpTenantInput {
  email: string;
  password: string;
  businessName: string;
}

export interface SignUpTenantOutput {
  tenantId: string;
  userId: string;
  email: string;
}

/**
 * Command handler: register a new tenant account.
 * Creates Tenant + owner User inside a single DB transaction via IIdentityTxRunner.
 * Emits: TenantCreated (from Tenant), UserActivated is NOT emitted for the owner (they start active).
 */
export class SignUpTenantHandler {
  constructor(
    private readonly tenants: ITenantRepository,
    private readonly txRunner: IIdentityTxRunner,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: SignUpTenantInput): Promise<Result<SignUpTenantOutput>> {
    try {
      const email = Email.create(input.email);
      const slug = Slug.fromBusinessName(input.businessName);

      const existing = await this.tenants.findBySlug(slug.value);
      if (existing) {
        return err(new ConflictError(`Business slug '${slug.value}' is already taken`));
      }

      const passwordHash = PasswordHash.hash(input.password);
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
