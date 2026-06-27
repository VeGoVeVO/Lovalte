import { ValueObject, ValidationError } from "../../../kernel";

interface Props { value: string }

/**
 * Immutable authentication token set once at pass minting.
 * Apple Wallet includes this token in every request to the web service.
 * NEVER changes after issuance — Apple requires this for APNs push continuity.
 *
 * Caller generates entropy: crypto.randomBytes(32).toString('hex').
 * Domain only validates and wraps; no I/O here.
 */
export class AuthenticationToken extends ValueObject<Props> {
  private constructor(props: Props) { super(props); }

  static fromRaw(raw: string): AuthenticationToken {
    if (!raw || raw.length < 32) {
      throw new ValidationError(
        "AuthenticationToken must be at least 32 characters",
      );
    }
    return new AuthenticationToken({ value: raw });
  }

  get value(): string { return this.props.value; }
  override toString(): string { return this.props.value; }
}
