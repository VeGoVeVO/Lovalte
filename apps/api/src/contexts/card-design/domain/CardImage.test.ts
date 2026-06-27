import { describe, it, expect } from "vitest";
import { CardImage, MAX_IMAGE_BYTES } from "./CardImage";
import { DomainError } from "../../../kernel";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const TENANT = "11111111-1111-1111-1111-111111111111";

describe("CardImage", () => {
  it("creates a valid PNG image with metadata + url", () => {
    const img = CardImage.create(TENANT, "icon", "image/png", PNG, "lucide");
    expect(img.contentType).toBe("image/png");
    expect(img.kind).toBe("icon");
    expect(img.source).toBe("lucide");
    expect(img.byteSize).toBe(PNG.length);
    expect(img.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(img.url).toBe(`/api/v1/images/${img.id.value}`);
  });

  it("accepts JPEG and SVG (without scripts)", () => {
    expect(() => CardImage.create(TENANT, "logo", "image/jpeg", JPEG)).not.toThrow();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(() => CardImage.create(TENANT, "strip", "image/svg+xml", svg)).not.toThrow();
  });

  it("rejects an unsupported content type", () => {
    expect(() => CardImage.create(TENANT, "icon", "application/pdf", PNG)).toThrow(DomainError);
  });

  it("rejects content whose magic bytes do not match the declared type", () => {
    // Claims PNG but carries JPEG bytes — the classic content-type spoof.
    expect(() => CardImage.create(TENANT, "icon", "image/png", JPEG)).toThrow(/does not match/i);
  });

  it("rejects an SVG containing a <script> tag", () => {
    const evil = Buffer.from("<svg><script>alert(1)</script></svg>");
    expect(() => CardImage.create(TENANT, "icon", "image/svg+xml", evil)).toThrow(DomainError);
  });

  it("rejects empty and oversized images", () => {
    expect(() => CardImage.create(TENANT, "icon", "image/png", Buffer.alloc(0))).toThrow(/empty/i);
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 1)]);
    expect(() => CardImage.create(TENANT, "icon", "image/png", huge)).toThrow(/exceeds/i);
  });

  it("rejects an unknown kind", () => {
    // @ts-expect-error — exercising the runtime guard
    expect(() => CardImage.create(TENANT, "banner", "image/png", PNG)).toThrow(DomainError);
  });
});
