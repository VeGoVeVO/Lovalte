import { describe, it, expect, vi, beforeEach } from "vitest";
import { IssuePassHandler } from "../IssuePassHandler";
import { UpdatePassFieldsHandler } from "../UpdatePassFieldsHandler";
import { Pass } from "../../domain/Pass";
import { SerialNumber } from "../../domain/SerialNumber";
import { AuthenticationToken } from "../../domain/AuthenticationToken";
import { DomainError, NotFoundError } from "../../../../kernel";
import type {
  IPassRepository,
  IPassTemplateRepository,
  IPassSigningPort,
  IPassBufferCache,
  PassTemplateDto,
} from "../../domain/ports";
import type { DomainEventBus, DomainEvent, Clock } from "../../../../kernel";

// ── Shared constants ────────────────────────────────────────────────────────

const TENANT_ID = "tenant-1";
const MEMBER_ID = "member-1";
const PASS_TYPE_ID = "template-1";
const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

const TEMPLATE: PassTemplateDto = {
  id: PASS_TYPE_ID,
  tenantId: TENANT_ID,
  passTypeIdentifier: "pass.com.example",
  teamIdentifier: "TEAM123",
  organizationName: "Example Org",
  description: "Test Pass",
  backgroundColor: "#ffffff",
  foregroundColor: "#000000",
  webServiceUrl: "https://example.com/wallet",
  fieldDefinitions: [],
  imageAssetRefs: {},
};

// ── Factory helpers ─────────────────────────────────────────────────────────

function makePass(now = FIXED_NOW): Pass {
  const p = Pass.issue({
    passTypeId: PASS_TYPE_ID,
    memberId: MEMBER_ID,
    tenantId: TENANT_ID,
    serialNumber: SerialNumber.mint(),
    authToken: AuthenticationToken.fromRaw("a".repeat(32)),
    fieldValues: [{ key: "points", label: "Points", value: 0 }],
    now,
  });
  p.pullEvents(); // clear issuance event so aggregate starts clean
  return p;
}

function makePassRepo(overrides?: Partial<IPassRepository>): IPassRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findBySerial: vi.fn().mockResolvedValue(null),
    findByMemberId: vi.fn().mockResolvedValue([]),
    findByMemberAndType: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTemplateRepo(tpl: PassTemplateDto | null = TEMPLATE): IPassTemplateRepository {
  return {
    findById: vi.fn().mockResolvedValue(tpl),
    upsert: vi.fn().mockResolvedValue(undefined),
  };
}

function makeSigner(reject = false): IPassSigningPort {
  const sign = reject
    ? vi.fn().mockRejectedValue(new DomainError("Pass signing not configured", "DOMAIN_ERROR"))
    : vi.fn().mockResolvedValue(Buffer.from("fake-pkpass"));
  return { sign };
}

function makeCache(): IPassBufferCache {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBus(): DomainEventBus & { captured: DomainEvent[] } {
  const captured: DomainEvent[] = [];
  return {
    captured,
    publish: vi.fn().mockImplementation(async (evts: DomainEvent[]) => {
      captured.push(...evts);
    }),
    subscribe: vi.fn(),
  };
}

function makeClock(date = FIXED_NOW): Clock {
  return { now: vi.fn().mockReturnValue(date) };
}

// ── IssuePassHandler ────────────────────────────────────────────────────────

describe("IssuePassHandler", () => {
  let passes: IPassRepository;
  let templates: IPassTemplateRepository;
  let signer: IPassSigningPort;
  let cache: IPassBufferCache;
  let clock: Clock;
  let bus: ReturnType<typeof makeBus>;

  beforeEach(() => {
    passes = makePassRepo();
    templates = makeTemplateRepo();
    signer = makeSigner();
    cache = makeCache();
    clock = makeClock();
    bus = makeBus();
  });

  function handler() {
    return new IssuePassHandler(passes, templates, signer, cache, clock, bus);
  }

  it("mints a new pass: result ok, serial non-empty, memberId matches", async () => {
    const result = await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.memberId).toBe(MEMBER_ID);
    expect(result.value.serialNumber).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(result.value.createdAt).toEqual(FIXED_NOW);
  });

  it("publishes PassIssued via the bus after persisting", async () => {
    await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });

    const issued = bus.captured.find((e) => e.name === "PassIssued");
    expect(issued).toBeDefined();
    expect(issued!.payload.memberId).toBe(MEMBER_ID);
    expect(issued!.payload.tenantId).toBe(TENANT_ID);
  });

  it("caches the signed buffer and encodes the bare passId as the wallet barcode", async () => {
    const result = await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(cache.put).toHaveBeenCalledOnce();

    // The barcode message must be the short passId (sparse → reliably scannable),
    // never an HMAC token or a "lovalte:pass:" prefix.
    const passJson = (signer.sign as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      barcodes: { message: string }[];
    };
    expect(passJson.barcodes[0].message).toBe(result.value.passId);
  });

  it("signs a stamp pass with the strip frame for the live earned count (strip_0 when fresh)", async () => {
    // Regression: the issue path used to sign + cache the BASE strip, so a
    // freshly added stamp card showed no stamps. It must resolve strip_<earned>.
    const stamps: PassTemplateDto = {
      ...TEMPLATE,
      fieldDefinitions: [
        {
          key: "points",
          label: "Stamps",
          region: "primary",
          loyaltyType: "stamps",
          loyaltyGoal: 10,
        },
      ],
      imageAssetRefs: {
        icon: "/api/v1/images/icon-1",
        strip: "/api/v1/images/base-strip",
        strip_0: "/api/v1/images/frame-0",
        strip_1: "/api/v1/images/frame-1",
      },
    };
    templates = makeTemplateRepo(stamps);

    const result = await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });
    expect(result.ok).toBe(true);

    const refs = (signer.sign as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<
      string,
      string
    >;
    expect(refs.strip).toBe("/api/v1/images/frame-0");
  });

  it("is idempotent: returns existing pass without calling save again", async () => {
    const existing = makePass();
    passes.findByMemberAndType = vi.fn().mockResolvedValue(existing);

    const result = await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.serialNumber).toBe(existing.serialNumber.value);
    expect(passes.save).not.toHaveBeenCalled();
    expect(signer.sign).not.toHaveBeenCalled();
  });

  it("returns NotFoundError when template is missing", async () => {
    templates.findById = vi.fn().mockResolvedValue(null);

    const result = await handler().execute({
      memberId: MEMBER_ID,
      passTypeId: PASS_TYPE_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });

  it("propagates DomainError when signing is not configured (certs absent)", async () => {
    signer = makeSigner(/* reject = */ true);

    await expect(
      handler().execute({ memberId: MEMBER_ID, passTypeId: PASS_TYPE_ID, tenantId: TENANT_ID }),
    ).rejects.toThrow(DomainError);

    // Pass must NOT be persisted if signing fails
    expect(passes.save).not.toHaveBeenCalled();
  });
});

// ── UpdatePassFieldsHandler ─────────────────────────────────────────────────

describe("UpdatePassFieldsHandler", () => {
  const NEW_FIELDS = [{ key: "points", label: "Points", value: 200 }];

  it("bumps lastUpdated monotonically and emits PassFieldsUpdated", async () => {
    const pass = makePass(new Date("2026-01-01T00:00:00.000Z"));
    const origTs = pass.lastUpdated.getTime();
    const passes = makePassRepo({ findById: vi.fn().mockResolvedValue(pass) });
    const bus = makeBus();
    // clock returns the same time as pass.lastUpdated → aggregate must advance by 1ms
    const clock = makeClock(new Date("2026-01-01T00:00:00.000Z"));

    const h = new UpdatePassFieldsHandler(passes, bus, clock);
    const result = await h.execute({
      passId: pass.id.value,
      tenantId: TENANT_ID,
      fieldValues: NEW_FIELDS,
    });

    expect(result.ok).toBe(true);
    expect(pass.lastUpdated.getTime()).toBeGreaterThan(origTs);
    expect(pass.version).toBe(2);
  });

  it("publishes PassFieldsUpdated via bus with correct serial", async () => {
    const pass = makePass();
    const passes = makePassRepo({ findById: vi.fn().mockResolvedValue(pass) });
    const bus = makeBus();

    const h = new UpdatePassFieldsHandler(passes, bus, makeClock());
    await h.execute({ passId: pass.id.value, tenantId: TENANT_ID, fieldValues: NEW_FIELDS });

    const evt = bus.captured.find((e) => e.name === "PassFieldsUpdated");
    expect(evt).toBeDefined();
    expect(evt!.payload.serial).toBe(pass.serialNumber.value);
    expect(evt!.payload.tenantId).toBe(TENANT_ID);
    expect(evt!.payload.version).toBe(2);
  });

  it("persists the pass after updating fields", async () => {
    const pass = makePass();
    const passes = makePassRepo({ findById: vi.fn().mockResolvedValue(pass) });
    const bus = makeBus();

    await new UpdatePassFieldsHandler(passes, bus, makeClock()).execute({
      passId: pass.id.value,
      tenantId: TENANT_ID,
      fieldValues: NEW_FIELDS,
    });

    expect(passes.save).toHaveBeenCalledWith(pass);
  });

  it("returns NotFoundError when pass does not exist", async () => {
    const passes = makePassRepo({ findById: vi.fn().mockResolvedValue(null) });
    const bus = makeBus();

    const result = await new UpdatePassFieldsHandler(passes, bus, makeClock()).execute({
      passId: "no-such-pass",
      tenantId: TENANT_ID,
      fieldValues: NEW_FIELDS,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
    expect(bus.publish).not.toHaveBeenCalled();
  });
});

// ── CreateEnrollLinkHandler + platform branching ────────────────────────────

import { CreateEnrollLinkHandler } from "../CreateEnrollLinkHandler";
import { detectWalletPlatform } from "../../presentation/routes";
import type { AppConfig } from "../../../../config/env";

describe("CreateEnrollLinkHandler", () => {
  const config = {
    APP_BASE_URL: "https://lovalte.com",
    QR_TOKEN_SECRET: "test-secret-16chars",
  } as AppConfig;

  it("mints a QR URL pointing at the platform-branching public enroll endpoint", async () => {
    const handler = new CreateEnrollLinkHandler(makeTemplateRepo(), config, makeClock());
    const r = await handler.execute({ templateId: PASS_TYPE_ID, tenantId: TENANT_ID });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe(
      `https://lovalte.com/api/v1/public/enroll?t=${encodeURIComponent(r.value.token)}`,
    );
  });

  it("fails when the template does not exist", async () => {
    const handler = new CreateEnrollLinkHandler(makeTemplateRepo(null), config, makeClock());
    const r = await handler.execute({ templateId: PASS_TYPE_ID, tenantId: TENANT_ID });
    expect(r.ok).toBe(false);
  });
});

describe("detectWalletPlatform", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15", "apple"],
    ["Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15", "apple"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/126", "google"],
    // iPadOS desktop-mode masquerades as Macintosh -> web fallback page
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", "web"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "web"],
    ["curl/8.5.0", "web"],
    [undefined, "web"],
  ] as const)("%s -> %s", (ua, expected) => {
    expect(detectWalletPlatform(ua as string | undefined)).toBe(expected);
  });
});
