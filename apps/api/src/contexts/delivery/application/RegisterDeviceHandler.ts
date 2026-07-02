import { Result, ok, err, UnauthorizedError } from "../../../kernel";
import type { IDeviceRepository, IRegistrationRepository, IPassReadPort } from "../domain/ports";
import { Registration } from "../domain/Registration";
import { constantTimeEquals } from "../domain/constantTimeEquals";

export interface RegisterDeviceCommand {
  deviceLibraryIdentifier: string;
  passTypeIdentifier: string;
  serialNumber: string;
  pushToken: string;
  /** Raw token from `Authorization: ApplePass <token>` header. */
  authToken: string;
}

export interface RegisterDeviceResult {
  /** 201 = new registration, 200 = already registered (idempotent). */
  status: 200 | 201;
}

/**
 * Apple PassKit web-service endpoint 9.1.
 * Validates the per-pass authentication token, upserts the device row
 * (refreshing push_token on re-registration), and inserts the registration.
 */
export class RegisterDeviceHandler {
  constructor(
    private readonly passes: IPassReadPort,
    private readonly devices: IDeviceRepository,
    private readonly registrations: IRegistrationRepository,
  ) {}

  async execute(
    cmd: RegisterDeviceCommand,
  ): Promise<Result<RegisterDeviceResult, UnauthorizedError>> {
    const pass = await this.passes.findBySerial(cmd.serialNumber);
    if (!pass || !constantTimeEquals(pass.authenticationToken, cmd.authToken)) {
      return err(new UnauthorizedError("Invalid authentication token"));
    }
    if (!constantTimeEquals(pass.passTypeIdentifier, cmd.passTypeIdentifier)) {
      return err(new UnauthorizedError("Pass type identifier mismatch"));
    }

    const { device } = await this.devices.upsert(cmd.deviceLibraryIdentifier, cmd.pushToken);

    const existing = await this.registrations.findByDeviceAndPass(device.id.value, pass.id);
    if (existing) {
      return ok({ status: 200 });
    }

    const reg = Registration.create({
      tenantId: pass.tenantId,
      deviceId: device.id,
      passId: pass.id,
    });
    await this.registrations.save(reg);
    return ok({ status: 201 });
  }
}
