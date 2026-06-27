import { describe, it, expect } from "vitest";
import { StoreImageHandler } from "../StoreImageHandler";
import type { IImageRepository, StoredImage } from "../IImageRepository";
import type { CardImage } from "../../domain/CardImage";
import { DomainError } from "../../../../kernel";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const TENANT = "22222222-2222-2222-2222-222222222222";

function makeRepo(): IImageRepository & { saved: { image: CardImage; bytes: Buffer }[] } {
  const saved: { image: CardImage; bytes: Buffer }[] = [];
  return {
    saved,
    async save(image, bytes) { saved.push({ image, bytes }); },
    async load(): Promise<StoredImage | null> { return null; },
  };
}

describe("StoreImageHandler", () => {
  it("stores a valid image and returns its public ref", async () => {
    const repo = makeRepo();
    const handler = new StoreImageHandler(repo);

    const r = await handler.execute({ tenantId: TENANT, kind: "icon", contentType: "image/png", bytes: PNG, source: "lucide" });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.kind).toBe("icon");
    expect(r.value.contentType).toBe("image/png");
    expect(r.value.byteSize).toBe(PNG.length);
    expect(r.value.url).toBe(`/api/v1/images/${r.value.id}`);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].bytes).toBe(PNG);
  });

  it("returns a DomainError and persists nothing when the image is invalid", async () => {
    const repo = makeRepo();
    const handler = new StoreImageHandler(repo);

    // Declares PNG but supplies non-PNG bytes → domain rejects.
    const r = await handler.execute({ tenantId: TENANT, kind: "icon", contentType: "image/png", bytes: Buffer.from("not a png") });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBeInstanceOf(DomainError);
    expect(repo.saved).toHaveLength(0);
  });
});
