import { ValueObject, ValidationError } from "../../../kernel";

interface RgbProps {
  r: number;
  g: number;
  b: number;
}

/** Immutable RGB color value object. Only accepts integer channels 0-255. Hex is rejected. */
export class RgbColor extends ValueObject<RgbProps> {
  private constructor(props: RgbProps) {
    super(props);
  }

  static create(r: number, g: number, b: number): RgbColor {
    for (const [name, v] of [["r", r], ["g", g], ["b", b]] as [string, number][]) {
      if (!Number.isInteger(v) || v < 0 || v > 255) {
        throw new ValidationError(`Color channel ${name}=${v} must be an integer 0-255`);
      }
    }
    return new RgbColor({ r, g, b });
  }

  /**
   * Parse an `rgb(r, g, b)` string. Throws ValidationError for hex or any other format -
   * hex is silently ignored by Apple Wallet so we reject it at the boundary.
   */
  static fromString(s: string): RgbColor {
    const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s.trim());
    if (!m) {
      throw new ValidationError(
        `"${s}" is not a valid rgb(r, g, b) string. Hex and other formats are not accepted.`
      );
    }
    return RgbColor.create(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  get r(): number {
    return this.props.r;
  }
  get g(): number {
    return this.props.g;
  }
  get b(): number {
    return this.props.b;
  }

  toRgbString(): string {
    return `rgb(${this.props.r}, ${this.props.g}, ${this.props.b})`;
  }
}
