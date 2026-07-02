import { describe, it, expect } from "vitest";
import { StoreImageHandler } from "../StoreImageHandler";
import type { IImageRepository, StoredImage } from "../IImageRepository";
import type { IImageNormalizer, NormalizeImageInput, NormalizeImageOutput } from "../IImageNormalizer";
import type { CardImage } from "../../domain/CardImage";
import { DomainError } from "../../../../kernel";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const TENANT = "22222222-2222-2222-2222-222222222222";

function makeRepo(): IImageRepository & { saved: { image: CardImage; bytes: Buffer }[] } {
  const saved: { image: CardImage; bytes: Buffer }[] = [];
  return {
    saved,
    async save(image, bytes) {
      saved.push({ image, bytes });
    },
    async load(): Promise<StoredImage | null> {
      return null;
    },
    async exists(): Promise<boolean> {
      return true;
    },
  };
}

/** Identity normalizer - no real image processing, so unit tests stay fast and deterministic. */
function makeIdentityNormalizer(): IImageNormalizer & { calls: NormalizeImageInput[] } {
  const calls: NormalizeImageInput[] = [];
  return {
    calls,
    async normalize(input): Promise<NormalizeImageOutput> {
      calls.push(input);
      return { bytes: input.bytes, contentType: "image/png" };
    },
  };
}

describe("StoreImageHandler", () => {
  it("stores a valid image and returns its public ref", async () => {
    const repo = makeRepo();
    const normalizer = makeIdentityNormalizer();
    const handler = new StoreImageHandler(repo, normalizer);

    const r = await handler.execute({
      tenantId: TENANT,
      kind: "icon",
      contentType: "image/png",
      bytes: PNG,
      source: "lucide",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("icon");
    expect(r.value.contentType).toBe("image/png");
    expect(r.value.byteSize).toBe(PNG.length);
    expect(r.value.url).toBe(`/api/v1/images/${r.value.id}`);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].bytes).toBe(PNG);
    expect(normalizer.calls).toHaveLength(1);
    expect(normalizer.calls[0].kind).toBe("icon");
  });

  it("returns a DomainError and persists nothing when the image is invalid", async () => {
    const repo = makeRepo();
    const normalizer = makeIdentityNormalizer();
    const handler = new StoreImageHandler(repo, normalizer);

    // Declares PNG but supplies non-PNG bytes → rejected before normalization runs.
    const r = await handler.execute({
      tenantId: TENANT,
      kind: "icon",
      contentType: "image/png",
      bytes: Buffer.from("not a png"),
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(DomainError);
    expect(repo.saved).toHaveLength(0);
    expect(normalizer.calls).toHaveLength(0);
  });

  it("returns a DomainError and persists nothing when normalization fails", async () => {
    const repo = makeRepo();
    const normalizer: IImageNormalizer = {
      async normalize() {
        throw new Error("corrupt image");
      },
    };
    const handler = new StoreImageHandler(repo, normalizer);

    const r = await handler.execute({
      tenantId: TENANT,
      kind: "generic",
      contentType: "image/png",
      bytes: PNG,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(DomainError);
    expect(repo.saved).toHaveLength(0);
  });

  it("stores the normalizer's PNG output, not the original bytes/contentType", async () => {
    const repo = makeRepo();
    const convertedPng = Buffer.concat([PNG, Buffer.from("converted")]);
    const normalizer: IImageNormalizer = {
      async normalize() {
        return { bytes: convertedPng, contentType: "image/png" };
      },
    };
    const handler = new StoreImageHandler(repo, normalizer);

    const r = await handler.execute({
      tenantId: TENANT,
      kind: "logo",
      contentType: "image/jpeg",
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.contentType).toBe("image/png");
    expect(repo.saved[0].bytes).toBe(convertedPng);
  });
});
