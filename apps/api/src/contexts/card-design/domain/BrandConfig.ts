import { DomainError } from "../../../kernel";
import { RgbColor } from "./RgbColor";

export interface FieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly valueTemplate: string;
  readonly numberStyle?: string;
  readonly changeMessage?: string;
}

export interface BrandConfigParams {
  organizationName: string;
  logoText?: string;
  backgroundColor: RgbColor;
  foregroundColor: RgbColor;
  labelColor?: RgbColor;
  headerFields: FieldDefinition[];
  primaryFields: FieldDefinition[];
  secondaryFields: FieldDefinition[];
  auxiliaryFields: FieldDefinition[];
  backFields: FieldDefinition[];
  iconRef?: string;
  logoRef?: string;
  stripRef?: string;
  /** Lucide icon name used for stamp cards' stamp marks (builder/preview). */
  stampIcon?: string;
  /** Uploaded "stamped"/"unstamped" stamp art refs (override the Lucide icon). */
  stampedRef?: string;
  unstampedRef?: string;
  /**
   * Pre-rendered strip frames for a stamp card, indexed by stamps earned
   * (stampStripRefs[n] = the strip showing n filled stamps). The browser renders
   * + uploads these at publish; pass-issuance swaps strip = stampStripRefs[earned]
   * at sign time. Keeps the stamp grid baked into the image (Apple has no native
   * stamp widget) with zero server-side image dependency.
   */
  stampStripRefs?: string[];
}

/**
 * BrandConfig value object - holds all Apple Wallet pass configuration.
 * Colors MUST be rgb(r,g,b) strings; validate() enforces field-count constraints
 * before publishing.
 */
export class BrandConfig {
  readonly organizationName: string;
  readonly logoText: string | undefined;
  readonly backgroundColor: RgbColor;
  readonly foregroundColor: RgbColor;
  readonly labelColor: RgbColor | undefined;
  readonly headerFields: ReadonlyArray<FieldDefinition>;
  readonly primaryFields: ReadonlyArray<FieldDefinition>;
  readonly secondaryFields: ReadonlyArray<FieldDefinition>;
  readonly auxiliaryFields: ReadonlyArray<FieldDefinition>;
  readonly backFields: ReadonlyArray<FieldDefinition>;
  readonly iconRef: string | undefined;
  readonly logoRef: string | undefined;
  readonly stripRef: string | undefined;
  readonly stampIcon: string | undefined;
  readonly stampedRef: string | undefined;
  readonly unstampedRef: string | undefined;
  readonly stampStripRefs: ReadonlyArray<string> | undefined;

  constructor(p: BrandConfigParams) {
    const name = (p.organizationName ?? "").trim();
    if (name.length === 0 || name.length > 64) {
      throw new DomainError("organizationName must be 1-64 characters");
    }
    if (p.logoText !== undefined && p.logoText.length > 24) {
      throw new DomainError("logoText must be ≤24 characters");
    }
    this.organizationName = name;
    this.logoText = p.logoText;
    this.backgroundColor = p.backgroundColor;
    this.foregroundColor = p.foregroundColor;
    this.labelColor = p.labelColor;
    this.headerFields = Object.freeze([...p.headerFields]);
    this.primaryFields = Object.freeze([...p.primaryFields]);
    this.secondaryFields = Object.freeze([...p.secondaryFields]);
    this.auxiliaryFields = Object.freeze([...p.auxiliaryFields]);
    this.backFields = Object.freeze([...p.backFields]);
    this.iconRef = p.iconRef;
    this.logoRef = p.logoRef;
    this.stripRef = p.stripRef;
    this.stampIcon = p.stampIcon;
    this.stampedRef = p.stampedRef;
    this.unstampedRef = p.unstampedRef;
    this.stampStripRefs = p.stampStripRefs ? Object.freeze([...p.stampStripRefs]) : undefined;
  }

  /**
   * Domain-level validation run before publishing. Enforces what Apple's
   * storeCard pass style actually renders (PassKit Package Format Reference):
   * - headerFields ≤ 3
   * - at most 1 primaryField (Apple allows 0 — stamp cards show the count as a
   *   field BELOW the strip, so they carry no primary field)
   * - secondaryFields + auxiliaryFields ≤ 4 (storeCard shares one 4-slot pool)
   * - backFields ≤ 20 (Apple allows unlimited; this is a boundary guard)
   * - iconRef must be registered (icon is required for every pass)
   */
  validate(): void {
    if (this.headerFields.length > 3) {
      throw new DomainError("headerFields max 3 (Apple Wallet constraint)");
    }
    if (this.primaryFields.length > 1) {
      throw new DomainError("At most 1 primaryField (Apple storeCard)");
    }
    const combined = this.secondaryFields.length + this.auxiliaryFields.length;
    if (combined > 4) {
      throw new DomainError("secondaryFields + auxiliaryFields must be ≤4 (storeCard field pool)");
    }
    if (this.backFields.length > 20) {
      throw new DomainError("backFields max 20");
    }
    if (!this.iconRef) {
      throw new DomainError("iconRef is required before publishing");
    }
  }

  /** Return a mutable copy of the constructor params for creating a derived VO. */
  toParams(): BrandConfigParams {
    return {
      organizationName: this.organizationName,
      logoText: this.logoText,
      backgroundColor: this.backgroundColor,
      foregroundColor: this.foregroundColor,
      labelColor: this.labelColor,
      headerFields: [...this.headerFields],
      primaryFields: [...this.primaryFields],
      secondaryFields: [...this.secondaryFields],
      auxiliaryFields: [...this.auxiliaryFields],
      backFields: [...this.backFields],
      iconRef: this.iconRef,
      logoRef: this.logoRef,
      stripRef: this.stripRef,
      stampIcon: this.stampIcon,
      stampedRef: this.stampedRef,
      unstampedRef: this.unstampedRef,
      stampStripRefs: this.stampStripRefs ? [...this.stampStripRefs] : undefined,
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      organizationName: this.organizationName,
      logoText: this.logoText ?? null,
      backgroundColor: this.backgroundColor.toRgbString(),
      foregroundColor: this.foregroundColor.toRgbString(),
      labelColor: this.labelColor?.toRgbString() ?? null,
      headerFields: [...this.headerFields],
      primaryFields: [...this.primaryFields],
      secondaryFields: [...this.secondaryFields],
      auxiliaryFields: [...this.auxiliaryFields],
      backFields: [...this.backFields],
      iconRef: this.iconRef ?? null,
      logoRef: this.logoRef ?? null,
      stripRef: this.stripRef ?? null,
      stampIcon: this.stampIcon ?? null,
      stampedRef: this.stampedRef ?? null,
      unstampedRef: this.unstampedRef ?? null,
      stampStripRefs: this.stampStripRefs ? [...this.stampStripRefs] : null,
    };
  }
}
