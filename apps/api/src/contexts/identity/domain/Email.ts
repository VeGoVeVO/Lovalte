import { ValueObject, ValidationError } from "../../../kernel";

interface EmailProps {
  value: string;
}

/**
 * Email value object: RFC-5321 validated, lowercase-normalised.
 * Domain layer only - no I/O.
 */
export class Email extends ValueObject<EmailProps> {
  private static readonly RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Create and validate from raw input. Throws ValidationError on failure. */
  static create(raw: string): Email {
    const normalised = raw.trim().toLowerCase();
    if (!normalised || !Email.RE.test(normalised) || normalised.length > 254) {
      throw new ValidationError("Invalid email address");
    }
    return new Email({ value: normalised });
  }

  /** Reconstitute from a trusted stored value (no re-validation). */
  static fromStored(value: string): Email {
    return new Email({ value });
  }

  get value(): string {
    return this.props.value;
  }
}
