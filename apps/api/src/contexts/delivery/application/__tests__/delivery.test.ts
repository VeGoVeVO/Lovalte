import { describe, it, expect, vi, beforeEach } from "vitest";
import { RegisterDeviceHandler, type RegisterDeviceCommand } from "../RegisterDeviceHandler";
import { UnregisterDeviceHandler, type UnregisterDeviceCommand } from "../UnregisterDeviceHandler";
import type {
  IDeviceRepository,
  IRegistrationRepository,
  IPassReadPort,
  IPushNotificationPort,
  PassReadDTO,
} from "../../domain/ports";
import type { DomainEvent, DomainEventBus, DomainEventHandler } from "../../../../kernel";
import { Device } from "../../domain/Device";
import { DeviceId } from "../../domain/DeviceId";
import { Registration } from "../../domain/Registration";

// ─── Shared test data ────────────────────────────────────────────────────────

const PASS_ID = "pass-uuid-1";
const TENANT_ID = "tenant-uuid-1";
const SERIAL = "SN-ABC-123";
const AUTH_TOKEN = "auth-token-secret";
const PASS_TYPE_ID = "pass.com.lovalte.loyalty";
const DEVICE_LIB_ID = "device-lib-id-1";
const PUSH_TOKEN = "apns-push-token-1";

const fakePass: PassReadDTO = {
  id: PASS_ID,
  tenantId: TENANT_ID,
  serialNumber: SERIAL,
  passTypeIdentifier: PASS_TYPE_ID,
  authenticationToken: AUTH_TOKEN,
  updatedAt: new Date("2026-06-01T09:00:00Z"),
  pkpassS3Key: "bucket/key.pkpass",
};

function makeDevice(libId = DEVICE_LIB_ID, pushToken = PUSH_TOKEN): Device {
  return Device.reconstitute({
    id: DeviceId.create(),
    deviceLibraryIdentifier: libId,
    pushToken,
    updatedAt: new Date(),
  });
}

// ─── Fake ports ──────────────────────────────────────────────────────────────

function makePassRead(pass: PassReadDTO | null = fakePass): IPassReadPort {
  return {
    findBySerial: vi.fn().mockResolvedValue(pass),
    findById: vi.fn().mockResolvedValue(pass),
  };
}

function makeDeviceRepo(existing: Device | null = null): IDeviceRepository & { deleted: string[] } {
  const device = existing ?? makeDevice();
  const deleted: string[] = [];
  return {
    deleted,
    findByLibId: vi.fn().mockResolvedValue(existing),
    upsert: vi.fn().mockResolvedValue({ device, isNew: existing === null }),
    delete: vi.fn().mockImplementation(async (id: string) => { deleted.push(id); }),
  };
}

function makeRegRepo(opts: {
  existing?: Registration | null;
  pushTokens?: string[];
  count?: number;
} = {}): IRegistrationRepository {
  return {
    findByDeviceAndPass: vi.fn().mockResolvedValue(opts.existing ?? null),
    save: vi.fn().mockResolvedValue(undefined),
    deleteByDeviceAndSerial: vi.fn().mockResolvedValue(undefined),
    countByDevice: vi.fn().mockResolvedValue(opts.count ?? 0),
    findUpdatedSince: vi.fn().mockResolvedValue([]),
    findPushTokensByPassId: vi.fn().mockResolvedValue(opts.pushTokens ?? []),
  };
}

// ─── RegisterDeviceHandler ───────────────────────────────────────────────────

describe("RegisterDeviceHandler", () => {
  const baseCmd: RegisterDeviceCommand = {
    deviceLibraryIdentifier: DEVICE_LIB_ID,
    passTypeIdentifier: PASS_TYPE_ID,
    serialNumber: SERIAL,
    pushToken: PUSH_TOKEN,
    authToken: AUTH_TOKEN,
  };

  it("returns 201 and saves a new Registration when device is not yet registered for the pass", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null); // device not yet stored; upsert creates it
    const registrations = makeRegRepo({ existing: null });
    const handler = new RegisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe(201);
    expect(registrations.save).toHaveBeenCalledOnce();
  });

  it("returns 200 and does not re-save when the registration already exists (idempotent)", async () => {
    const device = makeDevice();
    const reg = Registration.create({
      tenantId: TENANT_ID,
      deviceId: device.id,
      passId: PASS_ID,
    });
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ existing: reg });
    const handler = new RegisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe(200);
    expect(registrations.save).not.toHaveBeenCalled();
  });

  it("returns UnauthorizedError when auth token does not match", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo();
    const registrations = makeRegRepo();
    const handler = new RegisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute({ ...baseCmd, authToken: "wrong-token" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
    expect(registrations.save).not.toHaveBeenCalled();
  });

  it("returns UnauthorizedError when the pass does not exist", async () => {
    const passes = makePassRead(null);
    const devices = makeDeviceRepo();
    const registrations = makeRegRepo();
    const handler = new RegisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });

  it("upserts the device with the provided push token", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null);
    const registrations = makeRegRepo({ existing: null });
    const handler = new RegisterDeviceHandler(passes, devices, registrations);

    await handler.execute({ ...baseCmd, pushToken: "new-push-token" });

    expect(devices.upsert).toHaveBeenCalledWith(DEVICE_LIB_ID, "new-push-token");
  });
});

// ─── UnregisterDeviceHandler ─────────────────────────────────────────────────

describe("UnregisterDeviceHandler", () => {
  const baseCmd: UnregisterDeviceCommand = {
    deviceLibraryIdentifier: DEVICE_LIB_ID,
    passTypeIdentifier: PASS_TYPE_ID,
    serialNumber: SERIAL,
    authToken: AUTH_TOKEN,
  };

  it("removes the registration and returns ok", async () => {
    const device = makeDevice();
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ count: 0 });
    const handler = new UnregisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    expect(registrations.deleteByDeviceAndSerial).toHaveBeenCalledWith(
      device.id.value,
      SERIAL,
    );
  });

  it("deletes the device row when no registrations remain after unregister", async () => {
    const device = makeDevice();
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ count: 0 });
    const handler = new UnregisterDeviceHandler(passes, devices, registrations);

    await handler.execute(baseCmd);

    expect(devices.delete).toHaveBeenCalledWith(device.id.value);
  });

  it("does not delete the device row when other registrations remain", async () => {
    const device = makeDevice();
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ count: 2 });
    const handler = new UnregisterDeviceHandler(passes, devices, registrations);

    await handler.execute(baseCmd);

    expect(devices.delete).not.toHaveBeenCalled();
  });

  it("returns ok without error when the device is unknown (idempotent)", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null); // findByLibId returns null
    const registrations = makeRegRepo();
    const handler = new UnregisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    expect(registrations.deleteByDeviceAndSerial).not.toHaveBeenCalled();
  });

  it("returns UnauthorizedError when auth token is wrong", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null);
    const registrations = makeRegRepo();
    const handler = new UnregisterDeviceHandler(passes, devices, registrations);

    const result = await handler.execute({ ...baseCmd, authToken: "bad-token" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHORIZED");
  });
});

// ─── PassFieldsUpdated → push notification ───────────────────────────────────
//
// The subscription is registered inline in delivery/index.ts.
// We replicate the handler logic here using fakes to verify the integration
// behaviour: published PassFieldsUpdated → IPushNotificationPort.notify() is
// called with the pass's registered device push tokens.

describe("PassFieldsUpdated subscription behaviour", () => {
  /** Minimal in-memory event bus that mirrors the real one. */
  function makeInMemoryBus(): DomainEventBus & {
    publish(events: DomainEvent[]): Promise<void>;
  } {
    const handlers = new Map<string, DomainEventHandler[]>();
    return {
      subscribe(name: string, handler: DomainEventHandler): void {
        const list = handlers.get(name) ?? [];
        list.push(handler);
        handlers.set(name, list);
      },
      async publish(events: DomainEvent[]): Promise<void> {
        for (const evt of events) {
          for (const h of handlers.get(evt.name) ?? []) {
            await h(evt);
          }
        }
      },
    };
  }

  function makeEvent(
    name: string,
    payload: Record<string, unknown>,
  ): DomainEvent {
    return { name, occurredAt: new Date(), aggregateId: "agg-id", payload };
  }

  it("calls notify() with registered push tokens when PassFieldsUpdated is published", async () => {
    const bus = makeInMemoryBus();
    const passRead = makePassRead(fakePass);
    const regRepo = makeRegRepo({ pushTokens: [PUSH_TOKEN, "second-token"] });
    const apns: IPushNotificationPort = { notify: vi.fn().mockResolvedValue(undefined) };

    // Mirror the subscription logic from delivery/index.ts
    bus.subscribe("PassFieldsUpdated", async (event) => {
      const { passId } = event.payload as { passId?: string };
      if (!passId) return;
      const pass = await passRead.findById(passId);
      if (!pass) return;
      const pushTokens = await regRepo.findPushTokensByPassId(passId);
      if (pushTokens.length > 0) {
        await apns.notify(pushTokens, pass.passTypeIdentifier);
      }
    });

    await bus.publish([makeEvent("PassFieldsUpdated", { passId: PASS_ID })]);

    expect(apns.notify).toHaveBeenCalledOnce();
    expect(apns.notify).toHaveBeenCalledWith(
      [PUSH_TOKEN, "second-token"],
      PASS_TYPE_ID,
    );
  });

  it("does not call notify() when no devices are registered for the pass", async () => {
    const bus = makeInMemoryBus();
    const passRead = makePassRead(fakePass);
    const regRepo = makeRegRepo({ pushTokens: [] });
    const apns: IPushNotificationPort = { notify: vi.fn() };

    bus.subscribe("PassFieldsUpdated", async (event) => {
      const { passId } = event.payload as { passId?: string };
      if (!passId) return;
      const pass = await passRead.findById(passId);
      if (!pass) return;
      const pushTokens = await regRepo.findPushTokensByPassId(passId);
      if (pushTokens.length > 0) {
        await apns.notify(pushTokens, pass.passTypeIdentifier);
      }
    });

    await bus.publish([makeEvent("PassFieldsUpdated", { passId: PASS_ID })]);

    expect(apns.notify).not.toHaveBeenCalled();
  });

  it("silently skips when passId is missing from the event payload", async () => {
    const bus = makeInMemoryBus();
    const passRead = makePassRead(fakePass);
    const regRepo = makeRegRepo({ pushTokens: [PUSH_TOKEN] });
    const apns: IPushNotificationPort = { notify: vi.fn() };

    bus.subscribe("PassFieldsUpdated", async (event) => {
      const { passId } = event.payload as { passId?: string };
      if (!passId) return;
      const pass = await passRead.findById(passId as string);
      if (!pass) return;
      const pushTokens = await regRepo.findPushTokensByPassId(passId);
      if (pushTokens.length > 0) {
        await apns.notify(pushTokens, pass.passTypeIdentifier);
      }
    });

    await bus.publish([makeEvent("PassFieldsUpdated", {})]);

    expect(apns.notify).not.toHaveBeenCalled();
  });

  it("silently skips when the pass cannot be found by id", async () => {
    const bus = makeInMemoryBus();
    const passRead = makePassRead(null); // pass not found
    const regRepo = makeRegRepo({ pushTokens: [PUSH_TOKEN] });
    const apns: IPushNotificationPort = { notify: vi.fn() };

    bus.subscribe("PassFieldsUpdated", async (event) => {
      const { passId } = event.payload as { passId?: string };
      if (!passId) return;
      const pass = await passRead.findById(passId);
      if (!pass) return;
      const pushTokens = await regRepo.findPushTokensByPassId(passId);
      if (pushTokens.length > 0) {
        await apns.notify(pushTokens, pass.passTypeIdentifier);
      }
    });

    await bus.publish([makeEvent("PassFieldsUpdated", { passId: PASS_ID })]);

    expect(apns.notify).not.toHaveBeenCalled();
  });
});
