import { DomainError, ok, err, type Result } from "../../../kernel";
import { CardImage, assertAllowedImageInput, type ImageKind, type ImageSource } from "../domain/CardImage";
import type { IImageRepository } from "./IImageRepository";
import type { IImageNormalizer } from "./IImageNormalizer";

export interface StoreImageInput {
  tenantId: string;
  kind: ImageKind;
  contentType: string;
  bytes: Buffer;
  source?: ImageSource;
}

export interface StoredImageDTO {
  id: string;
  url: string;
  kind: ImageKind;
  contentType: string;
  byteSize: number;
}

/**
 * Store an uploaded (or Lucide-rasterised) card image. The input is checked
 * against the MIME allowlist first (assertAllowedImageInput, same invariant
 * CardImage.create enforces), then normalized to PNG at a kind-specific target
 * size BEFORE CardImage.create - so the domain always sees real PNG bytes and
 * stored bytes are always PNG regardless of what was uploaded.
 */
export class StoreImageHandler {
  constructor(
    private readonly repo: IImageRepository,
    private readonly normalizer: IImageNormalizer,
  ) {}

  async execute(input: StoreImageInput): Promise<Result<StoredImageDTO>> {
    try {
      assertAllowedImageInput(input.contentType, input.bytes);
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }

    let normalized: { bytes: Buffer; contentType: "image/png" };
    try {
      normalized = await this.normalizer.normalize({
        kind: input.kind,
        contentType: input.contentType,
        bytes: input.bytes,
      });
    } catch {
      return err(new DomainError("Unable to process image", "VALIDATION"));
    }

    let image: CardImage;
    try {
      image = CardImage.create(
        input.tenantId,
        input.kind,
        normalized.contentType,
        normalized.bytes,
        input.source,
      );
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
    await this.repo.save(image, normalized.bytes);
    return ok({
      id: image.id.value,
      url: image.url,
      kind: image.kind,
      contentType: image.contentType,
      byteSize: image.byteSize,
    });
  }
}
