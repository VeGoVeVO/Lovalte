// ── Card Builder document model + TOOLS command registry ─────────────────────
// The card is a pure `doc`. Every edit is a named tool in TOOLS; the UI calls
// dispatch(toolId, args) and a future AI calls the exact same entry point. This
// is the foundation that lets an AI drive the whole build.

import type { CardTemplateDTO, TemplateInput, LoyaltyType, FieldDef } from "./useTemplates";

export type Slot = "logo" | "hero";
export interface ImageLayer {
  /** Public image ref ("/api/v1/images/:id"). */
  src: string;
  tx: number; // -1..1 preview offset
  ty: number;
  scale: number; // 1..3
}
export interface DocField {
  id: string;
  label: string;
  value: string;
}
export interface CardDoc {
  type: LoyaltyType;
  templateId: string;
  logoText: string; // the single brand name (organizationName + Wallet name)
  theme: { bg: string; fg: string; label: string }; // hex
  logo: ImageLayer | null;
  hero: ImageLayer | null;
  iconRef: string; // Apple icon (required to publish)
  primaryLabel: string;
  headerFields: DocField[]; // top-right, max 3
  fields: DocField[]; // secondary row, max 4
  backFields: DocField[]; // back of the card, max 20
  stampsGoal: number;
  stampsEarned: number;
  stampIcon: string; // lucide name
  stampedRef: string; // uploaded "stamped" art ref (overrides the lucide icon)
  unstampedRef: string; // uploaded "unstamped" art ref
}

export const TYPE_META: Record<
  LoyaltyType,
  { name: string; blurb: string; icon: string; sample: (g: number) => string; primaryLabel: string }
> = {
  points: {
    name: "Points",
    blurb: "Earn & redeem",
    icon: "★",
    sample: () => "3,393",
    primaryLabel: "POINTS",
  },
  stamps: {
    name: "Stamps",
    blurb: "Buy N, get 1 free",
    icon: "●",
    sample: (g) => `6 / ${g}`,
    primaryLabel: "STAMPS",
  },
  cashback: {
    name: "Cashback",
    blurb: "Money back balance",
    icon: "$",
    sample: () => "$5.25",
    primaryLabel: "BALANCE",
  },
};
export const LOYALTY_KEYS: LoyaltyType[] = ["points", "stamps", "cashback"];

export interface Template {
  id: string;
  name: string;
  apply: Partial<CardDoc>;
}
const df = (label: string, value: string): DocField => ({ id: "f" + label, label, value });

export const TEMPLATES: Record<LoyaltyType, Template[]> = {
  points: [
    {
      id: "p-coffee",
      name: "Coffee",
      apply: {
        templateId: "p-coffee",
        theme: { bg: "#5c1f29", fg: "#ffffff", label: "#d8a48a" },
        logoText: "Coffee Shop",
        primaryLabel: "POINTS",
        fields: [df("NAME", "Juan Chavez"), df("REWARD", "$3.00")],
      },
    },
    {
      id: "p-noir",
      name: "Noir",
      apply: {
        templateId: "p-noir",
        theme: { bg: "#14161e", fg: "#ffffff", label: "#8b93a7" },
        logoText: "Your Brand",
        primaryLabel: "POINTS",
        fields: [df("MEMBER", "Alex Jones"), df("TIER", "Silver")],
      },
    },
    {
      id: "p-mint",
      name: "Fresh",
      apply: {
        templateId: "p-mint",
        theme: { bg: "#0f5c46", fg: "#ffffff", label: "#a8e6cf" },
        logoText: "Green Co",
        primaryLabel: "POINTS",
        fields: [df("MEMBER", "Sam Lee")],
      },
    },
  ],
  stamps: [
    {
      id: "s-bean",
      name: "Beans",
      apply: {
        templateId: "s-bean",
        theme: { bg: "#5a3a24", fg: "#ffffff", label: "#d8b48a" },
        logoText: "abba java",
        stampIcon: "coffee",
        stampsGoal: 10,
        stampsEarned: 6,
        fields: [],
      },
    },
    {
      id: "s-plum",
      name: "Berry",
      apply: {
        templateId: "s-plum",
        theme: { bg: "#4a2238", fg: "#ffffff", label: "#e0a8c8" },
        logoText: "Sweet Spot",
        stampIcon: "cake",
        stampsGoal: 8,
        stampsEarned: 3,
        fields: [],
      },
    },
    {
      id: "s-noir",
      name: "Mono",
      apply: {
        templateId: "s-noir",
        theme: { bg: "#1c1e26", fg: "#ffffff", label: "#9aa0b0" },
        logoText: "Daily Grind",
        stampIcon: "star",
        stampsGoal: 12,
        stampsEarned: 9,
        fields: [],
      },
    },
  ],
  cashback: [
    {
      id: "c-blue",
      name: "Fuel",
      apply: {
        templateId: "c-blue",
        theme: { bg: "#1d2c44", fg: "#ffffff", label: "#9fb6d6" },
        logoText: "FuelPlus",
        primaryLabel: "BALANCE",
        fields: [df("EARNED", "$1.40"), df("MEMBER", "Pat Kim")],
      },
    },
    {
      id: "c-green",
      name: "Grocer",
      apply: {
        templateId: "c-green",
        theme: { bg: "#143d2b", fg: "#ffffff", label: "#a8e0c0" },
        logoText: "Fresh Mart",
        primaryLabel: "BALANCE",
        fields: [df("THIS MONTH", "$4.10")],
      },
    },
  ],
};

export function initialDoc(type: LoyaltyType): CardDoc {
  const base: CardDoc = {
    type,
    templateId: "",
    logoText: "",
    theme: { bg: "#1a1a2e", fg: "#ffffff", label: "#9999bb" },
    logo: null,
    hero: null,
    iconRef: "",
    primaryLabel: TYPE_META[type].primaryLabel,
    headerFields: [],
    fields: [],
    backFields: [],
    stampsGoal: 10,
    stampsEarned: 6,
    stampIcon: "coffee",
    stampedRef: "",
    unstampedRef: "",
  };
  return { ...base, ...((TEMPLATES[type][0]?.apply ?? {}) as object) } as CardDoc;
}

// ── Color helpers (hex <-> rgb()) ─────────────────────────────────────────────
export const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
};
export const rgbToHex = (rgb?: string) => {
  const m = rgb?.match(/\d+/g);
  if (!m || m.length < 3) return "#1a1a2e";
  return (
    "#" +
    m
      .slice(0, 3)
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
};

// ── Tools: every edit is a named command ──────────────────────────────────────
export type ToolFn = (doc: CardDoc, args: Record<string, unknown>) => CardDoc;
const layer = (d: CardDoc, slot: Slot) => d[slot];

/** Apple Wallet storeCard field-count limits per editable list. */
export const FIELD_CAPS = { headerFields: 3, fields: 4, backFields: 20 } as const;
export type FieldList = keyof typeof FIELD_CAPS;
const fieldList = (a: Record<string, unknown>): FieldList =>
  a.list === "headerFields" || a.list === "backFields" ? a.list : "fields";
export const TOOLS: Record<string, ToolFn> = {
  "card.useTemplate": (d, a) => ({ ...d, ...(a.apply as Partial<CardDoc>) }),
  "theme.set": (d, a) => ({ ...d, theme: { ...d.theme, [a.key as string]: a.value as string } }),
  "text.logoText": (d, a) => ({ ...d, logoText: a.value as string }),
  "text.primaryLabel": (d, a) => ({ ...d, primaryLabel: a.value as string }),
  "image.set": (d, a) => ({
    ...d,
    [a.slot as Slot]: { src: a.src as string, tx: 0, ty: 0, scale: 1 },
  }),
  "image.move": (d, a) =>
    layer(d, a.slot as Slot)
      ? {
          ...d,
          [a.slot as Slot]: {
            ...(layer(d, a.slot as Slot) as ImageLayer),
            tx: a.tx as number,
            ty: a.ty as number,
          },
        }
      : d,
  "image.scale": (d, a) =>
    layer(d, a.slot as Slot)
      ? {
          ...d,
          [a.slot as Slot]: {
            ...(layer(d, a.slot as Slot) as ImageLayer),
            scale: a.scale as number,
          },
        }
      : d,
  "image.clear": (d, a) => ({ ...d, [a.slot as Slot]: null }),
  "icon.set": (d, a) => ({ ...d, iconRef: a.ref as string }),
  "field.set": (d, a) => {
    const l = fieldList(a);
    return {
      ...d,
      [l]: d[l].map((x) => (x.id === a.id ? { ...x, [a.key as string]: a.value as string } : x)),
    };
  },
  "field.add": (d, a) => {
    const l = fieldList(a);
    return d[l].length >= FIELD_CAPS[l]
      ? d
      : {
          ...d,
          [l]: [
            ...d[l],
            { id: "f" + Math.round(performance.now()), label: "LABEL", value: "Value" },
          ],
        };
  },
  "field.remove": (d, a) => {
    const l = fieldList(a);
    return { ...d, [l]: d[l].filter((x) => x.id !== a.id) };
  },
  "stamps.goal": (d, a) => {
    // Up to 20 stamps; the grid auto-shrinks the marks to fit the strip.
    const g = Math.max(1, Math.min(20, a.goal as number));
    return { ...d, stampsGoal: g, stampsEarned: Math.min(d.stampsEarned, g) };
  },
  "stamps.earned": (d, a) => ({
    ...d,
    stampsEarned: Math.max(0, Math.min(d.stampsGoal, a.earned as number)),
  }),
  "stamps.icon": (d, a) => ({ ...d, stampIcon: a.icon as string }),
  // Set/clear uploaded stamp art for the "stamped" or "unstamped" slot.
  "stamps.art": (d, a) => ({
    ...d,
    [a.slot === "unstamped" ? "unstampedRef" : "stampedRef"]: (a.ref as string) ?? "",
  }),
};
export function applyTool(
  doc: CardDoc,
  toolId: string,
  args: Record<string, unknown> = {},
): CardDoc {
  const fn = TOOLS[toolId];
  return fn ? fn(doc, args) : doc;
}

// ── doc <-> API ───────────────────────────────────────────────────────────────
const toApiFields = (rows: DocField[], prefix: string): FieldDef[] =>
  rows
    .filter((r) => r.label.trim() && r.value.trim())
    .map((r, i) => ({
      key: `${prefix}${i}`,
      label: r.label.trim(),
      valueTemplate: r.value.trim(),
    }));

export function docToInput(doc: CardDoc): TemplateInput {
  // The loyalty counter always has key "points" (so a holder's stored value keeps
  // mapping across edits). For STAMPS we put it in the secondary region so Wallet
  // renders "X / N" as a field BELOW the strip; the strip is then pure stamps.
  // For points/cashback it stays the prominent primary value.
  const isStamps = doc.type === "stamps";
  const loyaltyField = {
    key: "points",
    label: doc.primaryLabel || TYPE_META[doc.type].primaryLabel,
    valueTemplate: "{{points}}",
  };
  return {
    name: doc.logoText.trim() || "Card",
    organizationName: doc.logoText.trim() || "Your Business",
    logoText: doc.logoText.trim() || undefined,
    backgroundColor: hexToRgb(doc.theme.bg),
    foregroundColor: hexToRgb(doc.theme.fg),
    labelColor: hexToRgb(doc.theme.label),
    headerFields: toApiFields(doc.headerFields, "hdr"),
    primaryFields: isStamps ? [] : [loyaltyField],
    secondaryFields: isStamps
      ? [loyaltyField, ...toApiFields(doc.fields, "sec")]
      : toApiFields(doc.fields, "sec"),
    auxiliaryFields: [],
    backFields: toApiFields(doc.backFields, "back"),
    pointsPerVisit: 1,
    rewardThreshold: doc.type === "stamps" ? doc.stampsGoal : 10,
    cardType: doc.type,
    stampIcon: doc.stampIcon,
    stampedRef: doc.stampedRef || undefined,
    unstampedRef: doc.unstampedRef || undefined,
    tierRules: [],
  };
}

export function docFromTemplate(tmpl: CardTemplateDTO): CardDoc {
  const b = tmpl.brand;
  const ref = (r?: string): ImageLayer | null => (r ? { src: r, tx: 0, ty: 0, scale: 1 } : null);
  return {
    type: tmpl.rewardRule.cardType ?? "points",
    templateId: tmpl.id,
    logoText: b.logoText ?? b.organizationName ?? "",
    theme: {
      bg: rgbToHex(b.backgroundColor),
      fg: rgbToHex(b.foregroundColor),
      label: rgbToHex(b.labelColor),
    },
    logo: ref(b.logoRef),
    hero: ref(b.stripRef),
    iconRef: b.iconRef ?? "",
    // The loyalty field (key "points") may sit in primary (points/cashback) or
    // secondary (stamps). Read its label as primaryLabel and keep it OUT of the
    // editable secondary fields so it doesn't show up as a user-editable row.
    primaryLabel:
      b.primaryFields[0]?.label ??
      (b.secondaryFields ?? []).find((f) => f.key === "points")?.label ??
      "POINTS",
    headerFields: (b.headerFields ?? []).map((f) => ({
      id: "h" + f.key,
      label: f.label,
      value: f.valueTemplate,
    })),
    fields: (b.secondaryFields ?? [])
      .filter((f) => f.key !== "points")
      .map((f) => ({
        id: "s" + f.key,
        label: f.label,
        value: f.valueTemplate,
      })),
    backFields: (b.backFields ?? []).map((f) => ({
      id: "b" + f.key,
      label: f.label,
      value: f.valueTemplate,
    })),
    stampsGoal: tmpl.rewardRule.rewardThreshold,
    stampsEarned: Math.min(6, tmpl.rewardRule.rewardThreshold),
    stampIcon: b.stampIcon ?? "coffee",
    stampedRef: b.stampedRef ?? "",
    unstampedRef: b.unstampedRef ?? "",
  };
}
