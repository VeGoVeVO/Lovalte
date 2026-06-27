import type { ContextModule } from "../../http/app";
import { DeviceRepository } from "./infrastructure/DeviceRepository";
import { RegistrationRepository } from "./infrastructure/RegistrationRepository";
import { ApnsAdapter } from "./infrastructure/ApnsAdapter";
import { PassReadAdapter } from "./infrastructure/PassReadAdapter";
import { PassBinaryAdapter } from "./infrastructure/PassBinaryAdapter";
import { RegisterDeviceHandler } from "./application/RegisterDeviceHandler";
import { UnregisterDeviceHandler } from "./application/UnregisterDeviceHandler";
import { GetUpdatedSerialsHandler } from "./application/GetUpdatedSerialsHandler";
import { GetLatestPassHandler } from "./application/GetLatestPassHandler";
import { LogDeviceDiagnosticsHandler } from "./application/LogDeviceDiagnosticsHandler";
import { registerDeliveryRoutes } from "./presentation/routes";

/**
 * Delivery bounded context — Apple PassKit web service (5 endpoints) + APNs push stubs.
 *
 * Cross-context integration (inbound):
 *   "PassFieldsUpdated" event emitted by pass-issuance after a loyalty update.
 *   Payload must include `passId: string`.
 *   On receipt: look up registered device push tokens, fire APNs silent push.
 */
export const registerDelivery: ContextModule = async (app, deps) => {
  // Infrastructure
  const deviceRepo = new DeviceRepository(deps.pool);
  const regRepo = new RegistrationRepository(deps.pool);
  const passRead = new PassReadAdapter(deps.pool);
  const passBinary = new PassBinaryAdapter();
  const apns = new ApnsAdapter();

  // Application handlers
  const registerDevice = new RegisterDeviceHandler(passRead, deviceRepo, regRepo);
  const unregisterDevice = new UnregisterDeviceHandler(passRead, deviceRepo, regRepo);
  const getUpdatedSerials = new GetUpdatedSerialsHandler(regRepo);
  const getLatestPass = new GetLatestPassHandler(passRead, passBinary);
  const logDiagnostics = new LogDeviceDiagnosticsHandler();

  // Subscribe: PassFieldsUpdated → query push tokens → APNs silent push.
  // Apple Wallet polls endpoints 9.2 + 9.3 on receipt of the silent push.
  deps.bus.subscribe("PassFieldsUpdated", async (event) => {
    const { passId } = event.payload as { passId?: string };
    if (!passId) return;

    const pass = await passRead.findById(passId);
    if (!pass) return;

    const pushTokens = await regRepo.findPushTokensByPassId(passId);
    if (pushTokens.length > 0) {
      await apns.notify(pushTokens, pass.passTypeIdentifier);
    }
  });

  // HTTP routes
  registerDeliveryRoutes(app, deps, {
    registerDevice,
    unregisterDevice,
    getUpdatedSerials,
    getLatestPass,
    logDiagnostics,
  });
};
