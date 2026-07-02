import { describe, it, expect, vi } from "vitest";
import { RegisterDeviceHandler, type RegisterDeviceCommand } from "../RegisterDeviceHandler";
import { UnregisterDeviceHandler, type UnregisterDeviceCommand } from "../UnregisterDeviceHandler";
import { GetUpdatedSerialsHandler } from "../GetUpdatedSerialsHandler";
import { GetLatestPassHandler } from "../GetLatestPassHandler";
import { PushPassUpdateHandler } from "../PushPassUpdateHandler";
import type {
  IDeviceRepository,
  IRegistrationRepository,
  IPassReadPort,
  IPassBinaryPort,
  IPassResignPort,
  IPushNotificationPort,
  IPushLogRepository,
  PassReadDTO,
  UpdatedSerialRow,
  PushResult,
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
  version: 1,
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

function makeDeviceRepo(
  existing: Device | null = null,
): IDeviceRepository & { deleted: string[] } {
  const device = existing ?? makeDevice();
  const deleted: string[] = [];
  return {
    deleted,
    findByLibId: vi.fn().mockResolvedValue(existing),
    findByPushToken: vi.fn().mockResolvedValue(device),
    upsert: vi.fn().mockResolvedValue({ device, isNew: existing === null }),
    delete: vi.fn().mockImplementation(async (id: string) => {
      deleted.push(id);
    }),
  };
}

function makeRegRepo(
  opts: {
    existing?: Registration | null;
    pushTokens?: string[];
    count?: number;
    updatedSince?: UpdatedSerialRow[];
  } = {},
): IRegistrationRepository {
  return {
    findByDeviceAndPass: vi.fn().mockResolvedValue(opts.existing ?? null),
    save: vi.fn().mockResolvedValue(undefined),
    deleteByDeviceAndSerial: vi.fn().mockResolvedValue(undefined),
    deleteAllByDevice: vi.fn().mockResolvedValue(undefined),
    countByDevice: vi.fn().mockResolvedValue(opts.count ?? 0),
    findUpdatedSince: vi.fn().mockResolvedValue(opts.updatedSince ?? []),
    findPushTokensByPassId: vi.fn().mockResolvedValue(opts.pushTokens ?? []),
    touchLastFetchedByPass: vi.fn().mockResolvedValue(undefined),
    findStalePassIds: vi.fn().mockResolvedValue([]),
    purgeByTenant: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBinary(buffer: Buffer | null = Buffer.from("pkpass-bytes")): IPassBinaryPort {
  return { get: vi.fn().mockResolvedValue(buffer) };
}

function makeResign(buffer: Buffer | null = null): IPassResignPort {
  return { ensureCached: vi.fn().mockResolvedValue(buffer) };
}

function makePushLog(): IPushLogRepository & { entries: unknown[] } {
  const entries: unknown[] = [];
  return {
    entries,
    record: vi.fn().mockImplementation(async (entry: unknown) => {
      entries.push(entry);
    }),
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
    const handler = new UnregisterDeviceHandler(passes, devices, registrations, {
      publish: async () => {},
      subscribe: () => {},
    } as DomainEventBus);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    expect(registrations.deleteByDeviceAndSerial).toHaveBeenCalledWith(device.id.value, SERIAL);
  });

  it("deletes the device row when no registrations remain after unregister", async () => {
    const device = makeDevice();
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ count: 0 });
    const handler = new UnregisterDeviceHandler(passes, devices, registrations, {
      publish: async () => {},
      subscribe: () => {},
    } as DomainEventBus);

    await handler.execute(baseCmd);

    expect(devices.delete).toHaveBeenCalledWith(device.id.value);
  });

  it("does not delete the device row when other registrations remain", async () => {
    const device = makeDevice();
    const passes = makePassRead();
    const devices = makeDeviceRepo(device);
    const registrations = makeRegRepo({ count: 2 });
    const handler = new UnregisterDeviceHandler(passes, devices, registrations, {
      publish: async () => {},
      subscribe: () => {},
    } as DomainEventBus);

    await handler.execute(baseCmd);

    expect(devices.delete).not.toHaveBeenCalled();
  });

  it("returns ok without error when the device is unknown (idempotent)", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null); // findByLibId returns null
    const registrations = makeRegRepo();
    const handler = new UnregisterDeviceHandler(passes, devices, registrations, {
      publish: async () => {},
      subscribe: () => {},
    } as DomainEventBus);

    const result = await handler.execute(baseCmd);

    expect(result.ok).toBe(true);
    expect(registrations.deleteByDeviceAndSerial).not.toHaveBeenCalled();
  });

  it("returns UnauthorizedError when auth token is wrong", async () => {
    const passes = makePassRead();
    const devices = makeDeviceRepo(null);
    const registrations = makeRegRepo();
    const handler = new UnregisterDeviceHandler(passes, devices, registrations, {
      publish: async () => {},
      subscribe: () => {},
    } as DomainEventBus);

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

  function makeEvent(name: string, payload: Record<string, unknown>): DomainEvent {
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
    expect(apns.notify).toHaveBeenCalledWith([PUSH_TOKEN, "second-token"], PASS_TYPE_ID);
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

// ─── GetUpdatedSerialsHandler: tag precision ─────────────────────────────────

describe("GetUpdatedSerialsHandler", () => {
  it("echoes a millisecond-epoch tag, and the same tag returns nothing on the next call", async () => {
    const updatedAt = new Date("2026-06-01T09:00:00.123Z");
    const registrations = makeRegRepo({
      updatedSince: [{ serialNumber: SERIAL, updatedAt }],
    });
    const handler = new GetUpdatedSerialsHandler(registrations);

    const first = await handler.execute({
      deviceLibraryIdentifier: DEVICE_LIB_ID,
      passTypeIdentifier: PASS_TYPE_ID,
    });
    expect(first.ok).toBe(true);
    if (!first.ok || !first.value) throw new Error("expected a result");
    expect(first.value.lastUpdated).toBe(String(updatedAt.getTime()));

    // Second call echoes the tag back; the repository (mocked here as the
    // source of truth) reports nothing newer than it -> 204 (null).
    (registrations.findUpdatedSince as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const second = await handler.execute({
      deviceLibraryIdentifier: DEVICE_LIB_ID,
      passTypeIdentifier: PASS_TYPE_ID,
      passesUpdatedSince: first.value.lastUpdated,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected ok");
    expect(second.value).toBeNull();
    expect(registrations.findUpdatedSince).toHaveBeenLastCalledWith(
      DEVICE_LIB_ID,
      PASS_TYPE_ID,
      updatedAt.getTime(),
    );
  });

  it("upscales a legacy second-precision tag to milliseconds", async () => {
    const registrations = makeRegRepo({ updatedSince: [] });
    const handler = new GetUpdatedSerialsHandler(registrations);
    const legacySeconds = 1_700_000_000; // < 1e12 -> legacy seconds tag

    await handler.execute({
      deviceLibraryIdentifier: DEVICE_LIB_ID,
      passTypeIdentifier: PASS_TYPE_ID,
      passesUpdatedSince: String(legacySeconds),
    });

    expect(registrations.findUpdatedSince).toHaveBeenCalledWith(
      DEVICE_LIB_ID,
      PASS_TYPE_ID,
      legacySeconds * 1000,
    );
  });
});

// ─── GetLatestPassHandler ─────────────────────────────────────────────────────

describe("GetLatestPassHandler", () => {
  const baseQuery = {
    serialNumber: SERIAL,
    passTypeIdentifier: PASS_TYPE_ID,
    authToken: AUTH_TOKEN,
  };

  it("returns 304 when If-Modified-Since (floored to seconds) is not before the pass's updatedAt", async () => {
    const binary = makeBinary();
    const resign = makeResign();
    const registrations = makeRegRepo();
    const handler = new GetLatestPassHandler(makePassRead(), binary, resign, registrations);

    // Same second as fakePass.updatedAt (09:00:00), just later sub-second -
    // must still 304 once both sides are floored to whole seconds.
    const result = await handler.execute({
      ...baseQuery,
      ifModifiedSince: new Date("2026-06-01T09:00:00.900Z").toUTCString(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe(304);
    expect(binary.get).not.toHaveBeenCalled();
  });

  it("401s when the URL's passTypeIdentifier does not match the pass", async () => {
    const handler = new GetLatestPassHandler(
      makePassRead(),
      makeBinary(),
      makeResign(),
      makeRegRepo(),
    );

    const result = await handler.execute({ ...baseQuery, passTypeIdentifier: "pass.other.id" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe(401);
  });

  it("calls the resign port on a cache miss and serves its buffer", async () => {
    const resignedBuffer = Buffer.from("resigned-bytes");
    const binary = makeBinary(null); // cache miss
    const resign = makeResign(resignedBuffer);
    const registrations = makeRegRepo();
    const handler = new GetLatestPassHandler(makePassRead(), binary, resign, registrations);

    const result = await handler.execute(baseQuery);

    expect(resign.ensureCached).toHaveBeenCalledWith(SERIAL);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== 200) throw new Error("expected 200");
    expect(result.value.buffer).toBe(resignedBuffer);
    expect(registrations.touchLastFetchedByPass).toHaveBeenCalledWith(PASS_ID);
  });

  it("does not stamp last_fetched_at when the resign port also comes back empty", async () => {
    const binary = makeBinary(null);
    const resign = makeResign(null);
    const registrations = makeRegRepo();
    const handler = new GetLatestPassHandler(makePassRead(), binary, resign, registrations);

    const result = await handler.execute(baseQuery);

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.status !== 200) throw new Error("expected 200");
    expect(result.value.buffer).toBeNull();
    expect(registrations.touchLastFetchedByPass).not.toHaveBeenCalled();
  });
});

// ─── PushPassUpdateHandler: push + log + dead-token cleanup ──────────────────

describe("PushPassUpdateHandler", () => {
  it("logs every push attempt and cleans up a device on a 410 response", async () => {
    const registrations = makeRegRepo({ pushTokens: [PUSH_TOKEN] });
    const devices = makeDeviceRepo();
    const pushLog = makePushLog();
    const results: PushResult[] = [{ pushToken: PUSH_TOKEN, ok: false, status: 410 }];
    const apns: IPushNotificationPort = { notify: vi.fn().mockResolvedValue(results) };
    const handler = new PushPassUpdateHandler(makePassRead(), registrations, devices, apns, pushLog);

    const result = await handler.execute(PASS_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(1);
    expect(pushLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ passId: PASS_ID, pushToken: PUSH_TOKEN, ok: false, apnsStatus: 410 }),
    );
    expect(devices.findByPushToken).toHaveBeenCalledWith(PUSH_TOKEN);
    expect(registrations.deleteAllByDevice).toHaveBeenCalled();
    expect(devices.delete).toHaveBeenCalled();
  });

  it("cleans up on a 400 BadDeviceToken response", async () => {
    const registrations = makeRegRepo({ pushTokens: [PUSH_TOKEN] });
    const devices = makeDeviceRepo();
    const pushLog = makePushLog();
    const results: PushResult[] = [
      { pushToken: PUSH_TOKEN, ok: false, status: 400, reason: "BadDeviceToken" },
    ];
    const apns: IPushNotificationPort = { notify: vi.fn().mockResolvedValue(results) };
    const handler = new PushPassUpdateHandler(makePassRead(), registrations, devices, apns, pushLog);

    await handler.execute(PASS_ID);

    expect(registrations.deleteAllByDevice).toHaveBeenCalled();
    expect(devices.delete).toHaveBeenCalled();
  });

  it("does not clean up on a successful push", async () => {
    const registrations = makeRegRepo({ pushTokens: [PUSH_TOKEN] });
    const devices = makeDeviceRepo();
    const pushLog = makePushLog();
    const results: PushResult[] = [{ pushToken: PUSH_TOKEN, ok: true, status: 200 }];
    const apns: IPushNotificationPort = { notify: vi.fn().mockResolvedValue(results) };
    const handler = new PushPassUpdateHandler(makePassRead(), registrations, devices, apns, pushLog);

    await handler.execute(PASS_ID);

    expect(registrations.deleteAllByDevice).not.toHaveBeenCalled();
    expect(devices.delete).not.toHaveBeenCalled();
  });

  it("is a no-op when no devices are registered for the pass", async () => {
    const registrations = makeRegRepo({ pushTokens: [] });
    const devices = makeDeviceRepo();
    const pushLog = makePushLog();
    const apns: IPushNotificationPort = { notify: vi.fn() };
    const handler = new PushPassUpdateHandler(makePassRead(), registrations, devices, apns, pushLog);

    const result = await handler.execute(PASS_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sent).toBe(0);
    expect(apns.notify).not.toHaveBeenCalled();
  });
});
