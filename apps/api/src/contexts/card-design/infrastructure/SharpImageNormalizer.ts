import sharp from "sharp";
import type { ImageKind } from "../domain/CardImage";
import type { IImageNormalizer, NormalizeImageInput, NormalizeImageOutput } from "../application/IImageNormalizer";

/**
 * Fixed rasterisation density (dpi) for SVG input, per kind. sharp renders SVG
 * user units at 72dpi baseline by default; higher density = more source pixels
 * for the resize step below to work with.
 *
 * ponytail: fixed heuristic, not proportional to the source viewBox - correct
 * ceiling for common icon-library SVGs (16-512 viewBox) up to the strip target
 * (1125px); upgrade path = probe SVG intrinsic size (sharp metadata) first and
 * compute density precisely.
 */
const SVG_DENSITY: Record<ImageKind, number> = {
  icon: 300,
  logo: 300,
  strip: 600,
  generic: 300,
};

/** "generic" images are PNG-converted only, capped at this longest side. */
const GENERIC_MAX_SIDE = 2000;

/**
 * SharpImageNormalizer - implements IImageNormalizer with sharp.
 *
 * Every stored image ends up as real PNG bytes at a kind-specific target size:
 *  - icon: cover-crop to 87x87 (the largest Apple icon slot; @2x/@3x are the
 *    same PNG re-embedded by the signing adapter)
 *  - logo: fit inside 480x150, no pad, aspect preserved, alpha kept
 *  - strip: width-normalise to 1125, aspect preserved (Wallet's strip height
 *    depends on the card's field layout - 144pt without primary fields,
 *    123pt with - so the aspect the builder baked must survive)
 *  - generic: PNG-convert only, longest side capped at 2000px
 */
export class SharpImageNormalizer implements IImageNormalizer {
  async normalize(input: NormalizeImageInput): Promise<NormalizeImageOutput> {
    const isSvg = input.contentType === "image/svg+xml";
    const source = isSvg
      ? sharp(input.bytes, { density: SVG_DENSITY[input.kind] })
      : sharp(input.bytes);

    let pipeline: sharp.Sharp;
    switch (input.kind) {
      case "icon":
        pipeline = source.resize(87, 87, { fit: "cover" });
        break;
      case "logo":
        pipeline = source.resize(480, 150, { fit: "inside" });
        break;
      case "strip":
        // Height intentionally free: forcing 432 would side-crop the 123pt
        // (with-primary) strip variant on-device. See stampStrip.ts.
        pipeline = source.resize({ width: 1125, withoutEnlargement: true });
        break;
      case "generic":
      default:
        pipeline = source.resize(GENERIC_MAX_SIDE, GENERIC_MAX_SIDE, {
          fit: "inside",
          withoutEnlargement: true,
        });
        break;
    }

    const bytes = await pipeline.png().toBuffer();
    return { bytes, contentType: "image/png" };
  }
}
