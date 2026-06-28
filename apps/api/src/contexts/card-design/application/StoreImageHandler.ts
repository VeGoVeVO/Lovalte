import { DomainError, ok, err, type Result } from "../../../kernel";
import { CardImage, type ImageKind, type ImageSource } from "../domain/CardImage";
import type { IImageRepository } from "./IImageRepository";

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
 * Store an uploaded (or Lucide-rasterised) card image. All validation lives in
 * CardImage.create - this handler just wires domain → repository and returns the
 * public ref the builder writes into the template's BrandConfig.
 */
export class StoreImageHandler {
  constructor(private readonly repo: IImageRepository) {}

  async execute(input: StoreImageInput): Promise<Result<StoredImageDTO>> {
    let image: CardImage;
    try {
      image = CardImage.create(
        input.tenantId,
        input.kind,
        input.contentType,
        input.bytes,
        input.source,
      );
    } catch (e) {
      if (e instanceof DomainError) return err(e);
      throw e;
    }
    await this.repo.save(image, input.bytes);
    return ok({
      id: image.id.value,
      url: image.url,
      kind: image.kind,
      contentType: image.contentType,
      byteSize: image.byteSize,
    });
  }
}
