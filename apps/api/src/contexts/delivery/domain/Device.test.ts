import { describe, it, expect } from "vitest";
import { Device } from "./Device";
import { DeviceId } from "./DeviceId";

describe("Device aggregate", () => {
  it("emits DeviceRegistered on creation", () => {
    const device = Device.create({
      deviceLibraryIdentifier: "abc123",
      pushToken: "token-xyz",
    });
    const events = device.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("DeviceRegistered");
    expect(events[0].payload).toMatchObject({ deviceLibraryIdentifier: "abc123" });
    expect(events[0].aggregateId).toBe(device.id.value);
  });

  it("does not emit PushTokenUpdated when the token is unchanged", () => {
    const device = Device.create({ deviceLibraryIdentifier: "d1", pushToken: "same" });
    device.pullEvents(); // drain creation events
    device.updatePushToken("same");
    expect(device.pullEvents()).toHaveLength(0);
  });

  it("emits PushTokenUpdated when the token changes", () => {
    const device = Device.create({ deviceLibraryIdentifier: "d1", pushToken: "old" });
    device.pullEvents();
    device.updatePushToken("new-token");
    const events = device.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].name).toBe("PushTokenUpdated");
  });

  it("reconstitution produces no events", () => {
    const device = Device.reconstitute({
      id: DeviceId.create(),
      deviceLibraryIdentifier: "x",
      pushToken: "t",
      updatedAt: new Date(),
    });
    expect(device.pullEvents()).toHaveLength(0);
  });
});
