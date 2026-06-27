import { AggregateRoot } from "../../../kernel";
import { DeviceId } from "./DeviceId";

export interface DeviceProps {
  id: DeviceId;
  deviceLibraryIdentifier: string;
  pushToken: string;
  updatedAt: Date;
}

/**
 * Aggregate root for an Apple Wallet-enabled device.
 * pushToken is mutable: Apple may issue a new token at any time; the device
 * re-registers with the new token and we overwrite the stored value.
 * Invariant: (deviceLibraryIdentifier) is globally unique - enforced by DB UNIQUE.
 */
export class Device extends AggregateRoot<DeviceId> {
  private _pushToken: string;
  private _updatedAt: Date;

  private constructor(
    id: DeviceId,
    public readonly deviceLibraryIdentifier: string,
    pushToken: string,
    updatedAt: Date,
  ) {
    super(id);
    this._pushToken = pushToken;
    this._updatedAt = updatedAt;
  }

  /** Factory: new device with a fresh id. Emits DeviceRegistered. */
  static create(props: { deviceLibraryIdentifier: string; pushToken: string }): Device {
    const id = DeviceId.create();
    const now = new Date();
    const device = new Device(id, props.deviceLibraryIdentifier, props.pushToken, now);
    device.addEvent(
      device.makeEvent("DeviceRegistered", {
        deviceId: id.value,
        deviceLibraryIdentifier: props.deviceLibraryIdentifier,
      }),
    );
    return device;
  }

  /** Reconstitute from a persisted row - no events. */
  static reconstitute(props: DeviceProps): Device {
    return new Device(props.id, props.deviceLibraryIdentifier, props.pushToken, props.updatedAt);
  }

  /**
   * Update the APNs push token if it changed.
   * Idempotent: same token produces no event.
   */
  updatePushToken(token: string): void {
    if (this._pushToken === token) return;
    this._pushToken = token;
    this._updatedAt = new Date();
    this.addEvent(
      this.makeEvent("PushTokenUpdated", {
        deviceId: this.id.value,
        deviceLibraryIdentifier: this.deviceLibraryIdentifier,
      }),
    );
  }

  get pushToken(): string {
    return this._pushToken;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }
}
