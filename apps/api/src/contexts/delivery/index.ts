import type { ContextModule } from "../../http/app";
import { DeviceRepository } from "./infrastructure/DeviceRepository";
import { RegistrationRepository } from "./infrastructure/RegistrationRepository";
import { ApnsAdapter } from "./infrastructure/ApnsAdapter";
import { PassReadAdapter } from "./infrastructure/PassReadAdapter";
import { PassBinaryAdapter } from "./infrastructure/PassBinaryAdapter";
import { PassResignAdapter } from "./infrastructure/PassResignAdapter";
import { PushLogRepository } from "./infrastructure/PushLogRepository";
import { WalletDeviceLogRepository } from "./infrastructure/WalletDeviceLogRepository";
import { DeliveryStatsAdapter } from "./infrastructure/DeliveryStatsAdapter";
import { RegisterDeviceHandler } from "./application/RegisterDeviceHandler";
import { UnregisterDeviceHandler } from "./application/UnregisterDeviceHandler";
import { GetUpdatedSerialsHandler } from "./application/GetUpdatedSerialsHandler";
import { GetLatestPassHandler } from "./application/GetLatestPassHandler";
import { LogDeviceDiagnosticsHandler } from "./application/LogDeviceDiagnosticsHandler";
import { PushPassUpdateHandler } from "./application/PushPassUpdateHandler";
import { GetDeliveryStatusHandler } from "./application/GetDeliveryStatusHandler";
import { registerDeliveryRoutes } from "./presentation/routes";

const RECONCILE_INTERVAL_MS = 10 * 60 * 1_000; // 10 minutes

function log(obj: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

/**
 * Delivery bounded context - Apple PassKit web service (5 endpoints) + APNs push.
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
  const passBinary = new PassBinaryAdapter(deps.redis);
  const passResign = new PassResignAdapter(deps.services);
  const apns = new ApnsAdapter(deps.config);
  const pushLogRepo = new PushLogRepository(deps.pool);
  const walletLogRepo = new WalletDeviceLogRepository(deps.pool);
  const deliveryStats = new DeliveryStatsAdapter(deps.pool);

  // Application handlers
  const registerDevice = new RegisterDeviceHandler(passRead, deviceRepo, regRepo);
  const unregisterDevice = new UnregisterDeviceHandler(passRead, deviceRepo, regRepo, deps.bus);
  const getUpdatedSerials = new GetUpdatedSerialsHandler(regRepo);
  const getLatestPass = new GetLatestPassHandler(passRead, passBinary, passResign, regRepo);
  const logDiagnostics = new LogDeviceDiagnosticsHandler(walletLogRepo);
  const pushPassUpdate = new PushPassUpdateHandler(passRead, regRepo, deviceRepo, apns, pushLogRepo);
  const getDeliveryStatus = new GetDeliveryStatusHandler(deliveryStats);

  // Subscribe: TenantDeleted → hard-delete all registrations for that tenant.
  deps.bus.subscribe("TenantDeleted", async (event) => {
    await regRepo.purgeByTenant(String((event.payload as { tenantId: string }).tenantId));
  });

  // Subscribe: PassFieldsUpdated → push + log + dead-token cleanup.
  // Apple Wallet polls endpoints 9.2 + 9.3 on receipt of the silent push.
  deps.bus.subscribe("PassFieldsUpdated", async (event) => {
    const { passId } = event.payload as { passId?: string };
    if (!passId) return;
    await pushPassUpdate.execute(passId);
  });

  // Reconciliation sweep: catches passes whose push was never sent, silently
  // dropped, or whose device never fetched despite a successful push (e.g. the
  // push itself never reached the device). ponytail: a plain interval sweep
  // instead of a durable outbox - ceiling is up to RECONCILE_INTERVAL_MS of
  // staleness and a missed sweep if the process restarts mid-cycle; upgrade
  // path is a dedicated outbox table with at-least-once delivery.
  if (deps.config.NODE_ENV !== "test") {
    const timer = setInterval(() => {
      void (async () => {
        try {
          const staleIds = await regRepo.findStalePassIds();
          let sent = 0;
          for (const passId of staleIds) {
            const r = await pushPassUpdate.execute(passId);
            if (r.ok) sent += r.value.sent;
          }
          if (staleIds.length > 0) {
            log({ source: "delivery-reconcile", stalePasses: staleIds.length, pushesSent: sent });
          }
        } catch (e) {
          log({ source: "delivery-reconcile", event: "error", error: String(e) });
        }
      })();
    }, RECONCILE_INTERVAL_MS);
    timer.unref();
  }

  // HTTP routes
  registerDeliveryRoutes(app, deps, {
    registerDevice,
    unregisterDevice,
    getUpdatedSerials,
    getLatestPass,
    logDiagnostics,
    getDeliveryStatus,
  });
};
