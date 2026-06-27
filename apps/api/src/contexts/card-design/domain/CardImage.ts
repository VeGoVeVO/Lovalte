import { createHash, randomUUID } from "node:crypto";
import { Entity, UniqueId, DomainError } from "../../../kernel";

export class CardImageId extends UniqueId {
  static generate(): CardImageId {
    return new CardImageId(randomUUID());
  }
  static of(v: string): CardImageId {
    return new CardImageId(v);
  }
}

export type ImageKind = "icon" | "logo" | "strip" | "generic";
export type ImageSource = "upload" | "lucide";

/** MIME types we accept for card art. Raster + svg only; no documents/scripts. */
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** 2 MB hard cap. Card icons/logos/strips are tiny; this only bounds abuse. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const KINDS: ReadonlySet<string> = new Set(["icon", "logo", "strip", "generic"]);

/**
 * Verify the decoded bytes actually start with the magic signature for the
 * declared content type. Defends against a client lying about Content-Type to
 * smuggle a different payload (e.g. an HTML/SVG-with-script disguised as a PNG).
 */
function magicMatches(contentType: string, b: Buffer): boolean {
  switch (contentType) {
    case "image/png":
      return b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/jpeg":
      return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case "image/gif":
      return b.length >= 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a");
    case "image/webp":
      return b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP";
    case "image/svg+xml": {
      // SVG is text; require an <svg root and reject obvious script payloads.
      const head = b.subarray(0, 2048).toString("utf8").toLowerCase();
      return head.includes("<svg") && !head.includes("<script");
    }
    default:
      return false;
  }
}

export interface CardImageProps {
  tenantId: string;
  kind: ImageKind;
  contentType: AllowedImageType;
  byteSize: number;
  sha256: string;
  source: ImageSource;
  createdAt: Date;
}

/**
 * CardImage — a stored binary card asset (icon/logo/strip). The entity carries
 * metadata only; the raw bytes are passed alongside to the repository so large
 * blobs never travel through domain logic. `create` enforces every boundary
 * invariant (kind, MIME allowlist, size cap, magic-byte match) so an invalid
 * image can never be persisted.
 */
export class CardImage extends Entity<CardImageId> {
  private readonly props: CardImageProps;

  private constructor(id: CardImageId, props: CardImageProps) {
    super(id);
    this.props = props;
  }

  static create(
    tenantId: string,
    kind: ImageKind,
    contentType: string,
    bytes: Buffer,
    source: ImageSource = "upload"
  ): CardImage {
    if (!tenantId) throw new DomainError("tenantId is required", "VALIDATION");
    if (!KINDS.has(kind)) throw new DomainError(`Unsupported image kind: ${kind}`, "VALIDATION");
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
      throw new DomainError(`Unsupported image type: ${contentType}`, "VALIDATION");
    }
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new DomainError("Image is empty", "VALIDATION");
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new DomainError(`Image exceeds ${MAX_IMAGE_BYTES} bytes`, "VALIDATION");
    }
    if (!magicMatches(contentType, bytes)) {
      throw new DomainError("Image content does not match its declared type", "VALIDATION");
    }
    return new CardImage(CardImageId.generate(), {
      tenantId,
      kind,
      contentType: contentType as AllowedImageType,
      byteSize: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source,
      createdAt: new Date(),
    });
  }

  static reconstitute(id: CardImageId, props: CardImageProps): CardImage {
    return new CardImage(id, props);
  }

  get tenantId(): string {
    return this.props.tenantId;
  }
  get kind(): ImageKind {
    return this.props.kind;
  }
  get contentType(): AllowedImageType {
    return this.props.contentType;
  }
  get byteSize(): number {
    return this.props.byteSize;
  }
  get sha256(): string {
    return this.props.sha256;
  }
  get source(): ImageSource {
    return this.props.source;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Public URL this image is served at (relative to the API origin). */
  get url(): string {
    return `/api/v1/images/${this.id.value}`;
  }
}
