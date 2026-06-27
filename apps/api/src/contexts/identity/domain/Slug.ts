import { ValueObject, ValidationError } from "../../../kernel";

interface SlugProps { value: string }

/**
 * URL-safe tenant subdomain slug.
 * Rules: 2–63 chars, lowercase alphanumeric + hyphens, no leading/trailing hyphens.
 */
export class Slug extends ValueObject<SlugProps> {
  private static readonly RE = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/;

  /** Create from a raw slug string — validates format. */
  static create(raw: string): Slug {
    const s = raw.trim().toLowerCase();
    if (!s || !Slug.RE.test(s)) {
      throw new ValidationError(
        `Invalid slug '${s}': must be 2-63 lowercase alphanumeric chars or hyphens`
      );
    }
    return new Slug({ value: s });
  }

  /** Derive a slug from a human business name. */
  static fromBusinessName(name: string): Slug {
    const s = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 63);
    return Slug.create(s.length >= 2 ? s : `${s}-co`);
  }

  /** Reconstitute from a trusted stored value (no re-validation). */
  static fromStored(value: string): Slug {
    return new Slug({ value });
  }

  get value(): string { return this.props.value; }
}
