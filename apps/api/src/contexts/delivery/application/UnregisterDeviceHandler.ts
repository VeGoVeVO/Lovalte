import { Result, ok, err, UnauthorizedError } from "../../../kernel";
import type { IDeviceRepository, IRegistrationRepository, IPassReadPort } from "../domain/ports";

export interface UnregisterDeviceCommand {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  /** Raw token from `Authorization: ApplePass <token>` header. */
  authToken: string;
}

/**
 * Apple PassKit web-service endpoint 9.4.
 * Validates auth, removes the registration row, and deletes the device row
 * entirely if no other registrations remain.
 */
export class UnregisterDeviceHandler {
  constructor(
    private readonly passes: IPassReadPort,
    private readonly devices: IDeviceRepository,
    private readonly registrations: IRegistrationRepository,
  ) {}

  async execute(cmd: UnregisterDeviceCommand): Promise<Result<void, UnauthorizedError>> {
    const pass = await this.passes.findBySerial(cmd.serialNumber);
    if (!pass || pass.authenticationToken !== cmd.authToken) {
      return err(new UnauthorizedError("Invalid authentication token"));
    }

    const device = await this.devices.findByLibId(cmd.deviceLibraryIdentifier);
    if (!device) {
      // Nothing to unregister — treat as success (idempotent).
      return ok(undefined);
    }

    await this.registrations.deleteByDeviceAndSerial(device.id.value, cmd.serialNumber);

    const remaining = await this.registrations.countByDevice(device.id.value);
    if (remaining === 0) {
      await this.devices.delete(device.id.value);
    }

    return ok(undefined);
  }
}
