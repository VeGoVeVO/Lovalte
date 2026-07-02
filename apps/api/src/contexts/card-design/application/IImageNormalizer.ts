import type { ImageKind } from "../domain/CardImage";

export interface NormalizeImageInput {
  kind: ImageKind;
  contentType: string;
  bytes: Buffer;
}

export interface NormalizeImageOutput {
  bytes: Buffer;
  contentType: "image/png";
}

/**
 * Application-layer port: normalise an accepted upload (already validated
 * against the MIME allowlist) to real PNG bytes at a kind-specific target
 * size, so downstream code - CardImage.create's magic-byte invariant, PassKit
 * bundling - can assume "stored bytes are PNG" unconditionally. Implemented in
 * infrastructure/ (sharp).
 */
export interface IImageNormalizer {
  normalize(input: NormalizeImageInput): Promise<NormalizeImageOutput>;
}
