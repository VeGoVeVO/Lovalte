import { randomUUID } from "node:crypto";
import { ValueObject, ValidationError } from "../../../kernel";

interface Props { value: string }

/**
 * Globally unique serial number per PassTypeIdentifier.
 * UUID-based; immutable once minted. Apple uses this as the wallet entry key.
 */
export class SerialNumber extends ValueObject<Props> {
  private constructor(props: Props) { super(props); }

  static mint(): SerialNumber {
    return new SerialNumber({ value: randomUUID() });
  }

  static from(value: string): SerialNumber {
    if (!value || !value.trim()) {
      throw new ValidationError("SerialNumber cannot be empty");
    }
    return new SerialNumber({ value: value.trim() });
  }

  get value(): string { return this.props.value; }
  override toString(): string { return this.props.value; }
}
