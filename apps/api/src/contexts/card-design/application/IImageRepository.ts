import type { CardImage } from "../domain/CardImage";

export interface StoredImage {
  image: CardImage;
  bytes: Buffer;
}

/** Application-layer port for card image persistence. Implemented in infrastructure/. */
export interface IImageRepository {
  /** Persist the image metadata + bytes (one row). */
  save(image: CardImage, bytes: Buffer): Promise<void>;
  /** Load an image (metadata + bytes) by id for public serving. Null if absent. */
  load(id: string): Promise<StoredImage | null>;
  /**
   * True if `ref` resolves to a real image OWNED BY `tenantId`: a stored
   * `/api/v1/images/:id` row, or (for legacy pre-upload-pipeline refs) a
   * readable file path. Used by the publish preflight so an unresolvable or
   * cross-tenant icon/logo/strip ref fails publish instead of producing a
   * broken pass at sign time.
   */
  exists(ref: string, tenantId: string): Promise<boolean>;
}
