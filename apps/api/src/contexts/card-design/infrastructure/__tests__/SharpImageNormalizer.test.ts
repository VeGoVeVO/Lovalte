import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { SharpImageNormalizer } from "../SharpImageNormalizer";

const normalizer = new SharpImageNormalizer();

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
}

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="blue"/></svg>`,
);

describe("SharpImageNormalizer", () => {
  it("cover-crops an icon to exactly 87x87 and outputs PNG", async () => {
    const input = await makeJpeg(200, 100);
    const out = await normalizer.normalize({ kind: "icon", contentType: "image/jpeg", bytes: input });

    expect(out.contentType).toBe("image/png");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(87);
    expect(meta.height).toBe(87);
  });

  it("fits a logo inside 480x150 without padding, preserving aspect and alpha", async () => {
    const input = await makePng(1000, 1000); // square -> height-constrained
    const out = await normalizer.normalize({ kind: "logo", contentType: "image/png", bytes: input });

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBeLessThanOrEqual(480);
    expect(meta.height).toBeLessThanOrEqual(150);
    // No pad: for a square source, height is the binding constraint (150), and
    // resulting width equals height (aspect preserved, no letterboxing added).
    expect(meta.height).toBe(150);
    expect(meta.width).toBe(150);
    expect(meta.hasAlpha).toBe(true);
  });

  it("width-normalises a strip to 1125 preserving aspect (Wallet's band height varies by field layout)", async () => {
    const input = await makePng(2000, 500);
    const out = await normalizer.normalize({ kind: "strip", contentType: "image/png", bytes: input });

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(1125);
    // 2000x500 -> 1125 wide keeps the source aspect: round(500 * 1125/2000) = 281.
    expect(meta.height).toBe(281);
  });

  it("never enlarges a small strip (keeps source pixels)", async () => {
    const input = await makePng(800, 300);
    const out = await normalizer.normalize({ kind: "strip", contentType: "image/png", bytes: input });

    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(300);
  });

  it("PNG-converts a generic image without resizing when under the 2000px cap", async () => {
    const input = await makeJpeg(400, 300);
    const out = await normalizer.normalize({ kind: "generic", contentType: "image/jpeg", bytes: input });

    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("caps a generic image's longest side at 2000px, preserving aspect", async () => {
    const input = await makeJpeg(3000, 1500);
    const out = await normalizer.normalize({ kind: "generic", contentType: "image/jpeg", bytes: input });

    const meta = await sharp(out.bytes).metadata();
    expect(meta.width).toBe(2000);
    expect(meta.height).toBe(1000);
  });

  it("rasterises SVG input via density before applying the kind's target size", async () => {
    const out = await normalizer.normalize({ kind: "icon", contentType: "image/svg+xml", bytes: SVG });

    expect(out.contentType).toBe("image/png");
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(87);
    expect(meta.height).toBe(87);
  });
});
