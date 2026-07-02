import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import type { Pool } from "pg";
import { DomainError } from "../../../../kernel";
import type { AppConfig } from "../../../../config/env";
import { PassKitSigningAdapter } from "../PassKitSigningAdapter";

// node:fs/promises is only used here to load the (fake) signer cert/key/wwdr
// files - image bytes always come from the mocked Pool below, so a dummy
// buffer is fine for every call.
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("dummy-cert-bytes")),
}));

const pkPassCtor = vi.fn();
vi.mock("passkit-generator", () => ({
  PKPass: class {
    constructor(
      public readonly buffers: Record<string, Buffer>,
      public readonly opts: unknown,
    ) {
      pkPassCtor(buffers, opts);
    }
    async getAsBuffer(): Promise<Buffer> {
      return Buffer.from("signed-pass");
    }
  },
}));

const CONFIG = {
  APPLE_SIGNER_CERT_PATH: "/fake/cert.pem",
  APPLE_SIGNER_KEY_PATH: "/fake/key.pem",
  APPLE_WWDR_PATH: "/fake/wwdr.pem",
} as unknown as AppConfig;

function makePool(rows: Record<string, Buffer>): Pool {
  return {
    query: vi.fn(async (_sql: string, params: unknown[]) => {
      const id = (params as string[])[0];
      const bytes = rows[id];
      return { rows: bytes ? [{ bytes }] : [] };
    }),
  } as unknown as Pool;
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

const ICON_ID = "11111111-1111-1111-1111-111111111111";
const LOGO_ID = "22222222-2222-2222-2222-222222222222";
const STRIP_ID = "33333333-3333-3333-3333-333333333333";

afterEach(() => {
  pkPassCtor.mockClear();
  vi.restoreAllMocks();
});

describe("PassKitSigningAdapter", () => {
  it("throws a DomainError when the icon ref does not resolve", async () => {
    const adapter = new PassKitSigningAdapter(CONFIG, makePool({}));
    await expect(adapter.sign({}, {})).rejects.toBeInstanceOf(DomainError);
    expect(pkPassCtor).not.toHaveBeenCalled();
  });

  it("converts a non-PNG icon and renders true @1x/@2x/@3x PNG sizes (29/58/87)", async () => {
    const iconBytes = await makeJpeg(200, 200);
    const adapter = new PassKitSigningAdapter(CONFIG, makePool({ [ICON_ID]: iconBytes }));

    await adapter.sign({}, { icon: `/api/v1/images/${ICON_ID}` });

    expect(pkPassCtor).toHaveBeenCalledTimes(1);
    const [buffers] = pkPassCtor.mock.calls[0] as [Record<string, Buffer>];

    const m1 = await sharp(buffers["icon.png"]).metadata();
    expect(m1.format).toBe("png");
    expect(m1.width).toBe(29);
    expect(m1.height).toBe(29);

    const m2 = await sharp(buffers["icon@2x.png"]).metadata();
    expect(m2.width).toBe(58);
    expect(m2.height).toBe(58);

    const m3 = await sharp(buffers["icon@3x.png"]).metadata();
    expect(m3.format).toBe("png");
    expect(m3.width).toBe(87);
    expect(m3.height).toBe(87);
  });

  it("logs a structured warning and still builds the pass when logo/strip refs are set but unresolved", async () => {
    const iconBytes = await makePng(100, 100);
    const adapter = new PassKitSigningAdapter(CONFIG, makePool({ [ICON_ID]: iconBytes }));
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await adapter.sign(
      {},
      {
        icon: `/api/v1/images/${ICON_ID}`,
        logo: `/api/v1/images/${LOGO_ID}`,
        strip: `/api/v1/images/${STRIP_ID}`,
      },
    );

    const lines = writeSpy.mock.calls.map((c) => JSON.parse(String(c[0])));
    const logoWarning = lines.find((l) => l.event === "image_unresolved" && l.slot === "logo");
    const stripWarning = lines.find((l) => l.event === "image_unresolved" && l.slot === "strip");
    expect(logoWarning).toMatchObject({
      source: "PassKitSigningAdapter",
      ref: `/api/v1/images/${LOGO_ID}`,
    });
    expect(stripWarning).toMatchObject({
      source: "PassKitSigningAdapter",
      ref: `/api/v1/images/${STRIP_ID}`,
    });

    expect(pkPassCtor).toHaveBeenCalledTimes(1);
    const [buffers] = pkPassCtor.mock.calls[0] as [Record<string, Buffer>];
    expect(buffers["logo.png"]).toBeUndefined();
    expect(buffers["strip.png"]).toBeUndefined();
    // icon still built despite the other two slots being unresolved.
    expect(buffers["icon.png"]).toBeDefined();
  });

  it("renders logo fit-inside (no crop) and strip width-scaled aspect-preserved, including strip@3x", async () => {
    const iconBytes = await makePng(100, 100);
    const logoBytes = await makePng(1000, 1000); // square -> fit inside 480x150 => 150x150
    const stripBytes = await makePng(2000, 500); // aspect survives: Wallet's band height varies by field layout
    const adapter = new PassKitSigningAdapter(
      CONFIG,
      makePool({ [ICON_ID]: iconBytes, [LOGO_ID]: logoBytes, [STRIP_ID]: stripBytes }),
    );

    await adapter.sign(
      {},
      {
        icon: `/api/v1/images/${ICON_ID}`,
        logo: `/api/v1/images/${LOGO_ID}`,
        strip: `/api/v1/images/${STRIP_ID}`,
      },
    );

    const [buffers] = pkPassCtor.mock.calls[0] as [Record<string, Buffer>];

    const logo3x = await sharp(buffers["logo@3x.png"]).metadata();
    expect(logo3x.width).toBeLessThanOrEqual(480);
    expect(logo3x.height).toBeLessThanOrEqual(150);
    expect(logo3x.height).toBe(150); // square source, height-constrained box -> exact fit

    // 2000x500 source, width-scaled: heights follow the source aspect (h = w/4).
    for (const [key, w, h] of [
      ["strip.png", 375, 94],
      ["strip@2x.png", 750, 188],
      ["strip@3x.png", 1125, 281],
    ] as const) {
      const meta = await sharp(buffers[key]).metadata();
      expect(meta.format).toBe("png");
      expect(meta.width).toBe(w);
      expect(meta.height).toBe(h);
    }
  });
});
