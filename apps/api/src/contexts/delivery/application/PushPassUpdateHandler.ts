import { Result, ok } from "../../../kernel";
import type {
  IPassReadPort,
  IRegistrationRepository,
  IDeviceRepository,
  IPushNotificationPort,
  IPushLogRepository,
} from "../domain/ports";

export interface PushPassUpdateDto {
  /** Number of device tokens the push was attempted against. */
  sent: number;
}

/**
 * Push a silent-update notification to every device registered to a pass,
 * log every attempt, and clean up devices whose token APNs reports as
 * permanently dead. Shared by the PassFieldsUpdated event subscriber and the
 * reconciliation sweep (both in delivery/index.ts) so the push+log+cleanup
 * path only exists once.
 */
export class PushPassUpdateHandler {
  constructor(
    private readonly passes: IPassReadPort,
    private readonly registrations: IRegistrationRepository,
    private readonly devices: IDeviceRepository,
    private readonly apns: IPushNotificationPort,
    private readonly pushLog: IPushLogRepository,
  ) {}

  async execute(passId: string): Promise<Result<PushPassUpdateDto, never>> {
    const pass = await this.passes.findById(passId);
    if (!pass) return ok({ sent: 0 });

    const pushTokens = await this.registrations.findPushTokensByPassId(passId);
    if (pushTokens.length === 0) return ok({ sent: 0 });

    const results = await this.apns.notify(pushTokens, pass.passTypeIdentifier);

    for (const r of results) {
      await this.pushLog.record({
        passId: pass.id,
        serialNumber: pass.serialNumber,
        pushToken: r.pushToken,
        ok: r.ok,
        apnsStatus: r.status,
        reason: r.reason,
      });

      // 410 Gone or 400 BadDeviceToken = APNs will never accept this token
      // again; drop the device and its registrations rather than retry forever.
      const isDeadToken = r.status === 410 || (r.status === 400 && r.reason === "BadDeviceToken");
      if (!isDeadToken) continue;

      const device = await this.devices.findByPushToken(r.pushToken);
      if (!device) continue;
      await this.registrations.deleteAllByDevice(device.id.value);
      await this.devices.delete(device.id.value);
    }

    return ok({ sent: results.length });
  }
}
