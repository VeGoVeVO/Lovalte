import { randomUUID } from "node:crypto";
import { UniqueId } from "../../../kernel";

export class DeviceId extends UniqueId {
  static override create(): DeviceId {
    return new DeviceId(randomUUID());
  }
  static override from(v: string): DeviceId {
    return new DeviceId(v);
  }
}
