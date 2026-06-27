import { randomUUID } from "node:crypto";
import { Entity, UniqueId } from "../../../kernel";
import { DeviceId } from "./DeviceId";

export class RegistrationId extends UniqueId {
  static override create(): RegistrationId {
    return new RegistrationId(randomUUID());
  }
  static override from(v: string): RegistrationId {
    return new RegistrationId(v);
  }
}

export interface RegistrationProps {
  id: RegistrationId;
  tenantId: string;
  deviceId: DeviceId;
  /** UUID of the issuance.passes row - cross-context reference by ID only. */
  passId: string;
  registeredAt: Date;
}

/**
 * Entity pairing a Device with a Pass. Unique per (device, pass) pair.
 * Invariant enforced at DB level: UNIQUE (device_id, pass_id).
 */
export class Registration extends Entity<RegistrationId> {
  readonly tenantId: string;
  readonly deviceId: DeviceId;
  readonly passId: string;
  readonly registeredAt: Date;

  private constructor(props: RegistrationProps) {
    super(props.id);
    this.tenantId = props.tenantId;
    this.deviceId = props.deviceId;
    this.passId = props.passId;
    this.registeredAt = props.registeredAt;
  }

  static create(props: Omit<RegistrationProps, "id" | "registeredAt">): Registration {
    return new Registration({
      ...props,
      id: RegistrationId.create(),
      registeredAt: new Date(),
    });
  }

  static reconstitute(props: RegistrationProps): Registration {
    return new Registration(props);
  }
}
