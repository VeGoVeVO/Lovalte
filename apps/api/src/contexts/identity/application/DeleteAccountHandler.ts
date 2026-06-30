import { ok, err, NotFoundError } from "../../../kernel";
import type { Result, DomainEventBus } from "../../../kernel";
import type { ITenantRepository } from "./ports";

export interface DeleteAccountInput {
  tenantId: string;
}

/**
 * Command handler: permanently delete a tenant account and ALL its data.
 *
 * DDD cross-context erasure: publish TenantDeleted so every bounded context purges
 * its own tenant-scoped rows (one transaction each), THEN drop the tenant root. The
 * in-process bus awaits subscribers but isolates their errors, so the integration
 * test (zero rows remain) is the real completeness guarantee; a failed purger surfaces
 * loudly at deleteRoot when a leftover FK-cascade hits the append-only ledger trigger.
 * ponytail: add an outbox + retry when contexts move to a real broker.
 */
export class DeleteAccountHandler {
  constructor(
    private readonly tenants: ITenantRepository,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(input: DeleteAccountInput): Promise<Result<void>> {
    const tenant = await this.tenants.findById(input.tenantId);
    if (!tenant) {
      return err(new NotFoundError(`Tenant ${input.tenantId} not found`));
    }
    tenant.delete();
    await this.bus.publish(tenant.pullEvents());
    await this.tenants.deleteRoot(input.tenantId);
    return ok(undefined);
  }
}
