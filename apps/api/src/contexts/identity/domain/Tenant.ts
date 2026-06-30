import { AggregateRoot, ValidationError } from "../../../kernel";
import { TenantId } from "./Ids";
import { Slug } from "./Slug";

export type TenantStatus = "active" | "suspended" | "cancelled";

interface TenantProps {
  name: string;
  slug: Slug;
  status: TenantStatus;
  plan: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tenant aggregate root.
 * Invariant: name 1–100 chars. Status transitions: active → suspended → active | cancelled.
 * Emits: TenantCreated
 */
export class Tenant extends AggregateRoot<TenantId> {
  private constructor(
    id: TenantId,
    private readonly props: TenantProps,
  ) {
    super(id);
  }

  /** Factory: create a brand-new tenant (generates ID, sets status=active, plan=trial). */
  static create(params: { name: string; slug: Slug }): Tenant {
    const name = params.name.trim();
    if (!name || name.length > 100) {
      throw new ValidationError("Tenant name must be 1–100 characters");
    }
    const id = TenantId.create();
    const now = new Date();
    const tenant = new Tenant(id, {
      name,
      slug: params.slug,
      status: "active",
      plan: "trial",
      createdAt: now,
      updatedAt: now,
    });
    tenant.addEvent(
      tenant.makeEvent("TenantCreated", {
        tenantId: id.value,
        name,
        slug: params.slug.value,
      }),
    );
    return tenant;
  }

  /** Reconstitute from persistence - no event emitted. */
  static reconstitute(id: string, props: TenantProps): Tenant {
    return new Tenant(TenantId.from(id), props);
  }

  /**
   * Permanently delete the account. Emits TenantDeleted so every bounded context
   * purges its own tenant-scoped rows (members, passes, scans, analytics, …);
   * identity then drops the tenant root. Irreversible.
   */
  delete(): void {
    this.addEvent(this.makeEvent("TenantDeleted", { tenantId: this.id.value }));
  }

  get name(): string {
    return this.props.name;
  }
  get slug(): Slug {
    return this.props.slug;
  }
  get status(): TenantStatus {
    return this.props.status;
  }
  get plan(): string {
    return this.props.plan;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }
}
