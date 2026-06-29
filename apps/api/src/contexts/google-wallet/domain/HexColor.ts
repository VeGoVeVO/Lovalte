import { ValidationError } from "../../../kernel";

/** Value object: strict #rrggbb format required by Google Wallet hexBackgroundColor.
 *  Google rejects shorthand (#abc), alpha (#rrggbbaa), and named colors. */
export class HexColor {
  private constructor(private readonly _value: string) {}

  static create(hex: string): HexColor {
    if (!/^#[0-9a-f]{6}$/.test(hex)) {
      throw new ValidationError(`Invalid hex color "${hex}": must be lowercase #rrggbb`);
    }
    return new HexColor(hex);
  }

  /** Convert rgb(r, g, b) string from BrandConfig to HexColor. */
  static fromRgbString(rgb: string): HexColor {
    const m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(rgb);
    if (!m) throw new ValidationError(`Cannot parse color string: "${rgb}"`);
    const hex =
      "#" +
      [m[1], m[2], m[3]]
        .map((n) => Math.min(255, parseInt(n, 10)).toString(16).padStart(2, "0"))
        .join("");
    return new HexColor(hex);
  }

  get value(): string {
    return this._value;
  }
}
