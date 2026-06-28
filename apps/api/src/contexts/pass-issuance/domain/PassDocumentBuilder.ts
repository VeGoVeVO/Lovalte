import type { Pass, PassFieldValue } from "./Pass";
import type { PassTemplateDto } from "./ports";

/** pass.json shape (Apple PassKit format v1). */
export interface PassDocument {
  formatVersion: 1;
  passTypeIdentifier: string;
  serialNumber: string;
  teamIdentifier: string;
  organizationName: string;
  description: string;
  backgroundColor: string;
  foregroundColor: string;
  labelColor?: string;
  logoText?: string;
  /** Apple greys the pass out and marks it invalid when true. */
  voided?: boolean;
  webServiceURL: string;
  authenticationToken: string;
  barcodes: Array<{
    format: "PKBarcodeFormatQR";
    message: string;
    messageEncoding: "iso-8859-1";
  }>;
  storeCard: {
    headerFields: PassFieldEntry[];
    primaryFields: PassFieldEntry[];
    secondaryFields: PassFieldEntry[];
    auxiliaryFields: PassFieldEntry[];
    backFields: PassFieldEntry[];
  };
}

interface PassFieldEntry {
  key: string;
  label: string;
  value: string | number;
  changeMessage?: string;
}

/**
 * Pure domain service: assembles the pass.json document from Pass aggregate data
 * and a frozen template snapshot. Zero I/O - returns a plain serialisable object.
 *
 * The qrMessage is pre-computed by the application layer (HMAC-SHA256 token).
 */
/**
 * Format the raw loyalty counter the way the chosen mechanic displays it.
 * Mirrors card-design's RewardRule.formatLoyaltyValue (duplicated, not imported,
 * to keep the two bounded contexts independent).
 */
function formatLoyalty(type: "points" | "stamps" | "cashback", raw: unknown, goal: number): string {
  const n = Number(raw);
  const safe = Number.isFinite(n) ? n : 0;
  if (type === "stamps") return `${Math.min(Math.max(safe, 0), goal)} / ${goal}`;
  if (type === "cashback") return `$${safe.toFixed(2)}`;
  return String(Math.trunc(safe));
}

export class PassDocumentBuilder {
  build(pass: Pass, template: PassTemplateDto, qrMessage: string): PassDocument {
    const fieldsByKey = new Map<string, PassFieldValue>(pass.fieldValues.map((fv) => [fv.key, fv]));

    const header: PassFieldEntry[] = [];
    const primary: PassFieldEntry[] = [];
    const secondary: PassFieldEntry[] = [];
    const auxiliary: PassFieldEntry[] = [];
    const back: PassFieldEntry[] = [];

    for (const def of template.fieldDefinitions) {
      const fv = fieldsByKey.get(def.key);
      const entry: PassFieldEntry = {
        key: def.key,
        label: def.label,
        value: def.loyaltyType
          ? formatLoyalty(def.loyaltyType, fv?.value ?? 0, def.loyaltyGoal ?? 10)
          : (fv?.value ?? ""),
        ...(def.changeMessage ? { changeMessage: def.changeMessage } : {}),
      };
      if (def.region === "header") header.push(entry);
      else if (def.region === "primary") primary.push(entry);
      else if (def.region === "secondary") secondary.push(entry);
      else if (def.region === "auxiliary") auxiliary.push(entry);
      else if (def.region === "back") back.push(entry);
    }

    const doc: PassDocument = {
      formatVersion: 1,
      passTypeIdentifier: template.passTypeIdentifier,
      serialNumber: pass.serialNumber.value,
      teamIdentifier: template.teamIdentifier,
      organizationName: template.organizationName,
      description: template.description,
      backgroundColor: template.backgroundColor,
      foregroundColor: template.foregroundColor,
      webServiceURL: template.webServiceUrl,
      authenticationToken: pass.authToken.value,
      barcodes: [
        {
          format: "PKBarcodeFormatQR",
          message: qrMessage,
          messageEncoding: "iso-8859-1",
        },
      ],
      storeCard: {
        headerFields: header,
        primaryFields: primary,
        secondaryFields: secondary,
        auxiliaryFields: auxiliary,
        backFields: back,
      },
    };

    if (pass.voided) doc.voided = true;
    if (template.labelColor) doc.labelColor = template.labelColor;
    // Apple renders logoText (never organizationName) as the brand on the pass
    // front; default to the org name so a card without explicit logo text still
    // shows its brand instead of a blank top-left.
    doc.logoText = template.logoText || template.organizationName;

    return doc;
  }
}
