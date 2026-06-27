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
}
