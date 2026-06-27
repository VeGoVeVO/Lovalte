# 03 — Images, Colors & Localization

Primary source: archived `PassKit_PG/Creating.html` (Table 4-1 + image-dimension tables), confirmed verbatim by the gap-fill verifier.

## Image asset table (all dimensions in **points**; multiply by scale for pixels)

| File | @1x (pt) | @2x (px) | @3x (px) | storeCard? | Required? |
|---|---|---|---|---|---|
| `icon.png` | 29 × 29 | 58 × 58 | 87 × 87 | ✔ | **Effectively yes** (see note) |
| `logo.png` | 160 × 50 (max; usually narrower) | 320 × 100 | 480 × 150 | ✔ | Recommended |
| `strip.png` | **375 × 144** (storeCard) | **750 × 288** | **1125 × 432** | ✔ | Optional |
| `thumbnail.png` | 90 × 90 | 180 × 180 | 270 × 270 | ✘ | n/a for storeCard |
| `background.png` | 180 × 220 | 360 × 440 | 540 × 660 | ✘ | n/a for storeCard |
| `footer.png` | 286 × 15 | 572 × 30 | 858 × 45 | ✘ | n/a for storeCard |

**Supported images per style** (verbatim Table 4-1) **[VERIFIED]**:
- `boardingPass`: logo, icon, footer
- `coupon`: logo, icon, strip
- `eventTicket`: logo, icon, strip, background, thumbnail
- `generic`: logo, icon, thumbnail
- **`storeCard`: logo, icon, strip** ← only these three

> A `storeCard` supports **only icon, logo, strip**. Adding `background.png`/`thumbnail.png` to a storeCard is unsupported (ignored or rejected). **[VERIFIED]**

### File naming (Retina convention)
Provide all three scales: `icon.png` / `icon@2x.png` / `icon@3x.png`, same for `logo` and `strip`. **[VERIFIED]**

### Notes / caveats on dimensions

- **`strip.png` = 375 × 144 pt for storeCard.** **[CORRECTED · C2]** This is the documented "gift cards and coupons" bucket. Apple's table never literally writes "storeCard" against a strip size; the alternative is **375 × 123** ("all other cases"). **375 × 144 is the safe choice** — images are scaled/cropped to fit, and two independent references (walletwallet, passmeister) put storeCard at 375 × 144. **Do NOT use 375 × 98 — that is the event-ticket size** and will look wrong on a loyalty card.
  - Full strip sub-variants (iPhone 6/6 Plus, 375-pt wide): event tickets `375×98`, **gift cards/coupons `375×144`**, all other `375×123`. **[VERIFIED]**
  - Legacy (320-pt wide hardware): event tickets `320×84`, square-barcode on 3.5″ `320×110`, all other `320×123`. **[VERIFIED]** (not relevant for modern devices)
- **`icon.png` is "required" in practice.** Apple says it *"should measure 29 × 29 points"* (note: "should", not "must"). It appears on the **lock screen and in Mail** (not on the pass front face). Omitting it causes a signing/validation failure in real tooling → **treat it as required**. **[CORRECTED·SECONDARY · C13]**
- **`logo.png`** renders top-left next to `logoText`; the 160×50 box is a max — most brand logos render narrower (aspect preserved, then cropped). **[VERIFIED]**
- **`strip.png`** sits *behind* the primary field; the big points value renders on top of it. Use `suppressStripShine: true` if the gloss clashes. **[VERIFIED]**

### PNG format **[VERIFIED·SECONDARY / partly UNVERIFIED]**
- All assets are **PNG**.
- **sRGB** color space and an **alpha channel** (for `icon`/`logo` transparency) are the expectation. The archived Apple guide does **not** state sRGB verbatim — this comes from corroborating 3rd-party docs and Apple's general asset conventions. Avoid CMYK / Display-P3 PNGs (unpredictable color in Wallet).

## Colors

Three color keys, **`rgb(r, g, b)` strings only** (integers 0–255): **[VERIFIED]**

```json
"backgroundColor": "rgb(44, 28, 14)",
"foregroundColor": "rgb(255, 245, 230)",
"labelColor":      "rgb(200, 160, 100)"
```

- Apple verbatim: *"Colors are specified as RGB values—for example, `rgb(0, 255, 0)` is bright green."*
- **Hex is silently ignored** (defaults to black-on-white). **[VERIFIED]**
- `backgroundColor` is ignored when a `background.png` exists — moot for storeCard (no background image).
- **`stripColor`** is **not** an Apple-confirmed key — see [`02 §2`](02-pass-json-reference.md) and corrections **C1**. Don't use it.

## storeCard front-face layout map **[VERIFIED]**

```
┌──────────────────────────────────────────────┐
│ [logo.png] logoText            headerFields ▸ │  ← top row (header: up to 3, right-aligned)
│┌────────────────────────────────────────────┐│
││  strip.png (375×144)                        ││  ← strip image zone
││     primaryFields  (1, large, on the strip) ││
│└────────────────────────────────────────────┘│
│  secondaryFields  +  auxiliaryFields         │  ← combined max 4 (with square barcode)
│                                               │
│              [ QR / barcode ]                 │  ← below the fields
└──────────────────────────────────────────────┘
        (tap ⓘ → backFields, unlimited)
```
`icon.png` does **not** appear here — only on the lock screen and in Mail.

## Localization **[VERIFIED]**

Each language gets a `<lang>.lproj/` directory **inside** the `.pkpass` bundle. Language codes are ISO 639-1 (`en`, `es`, `fr`, `de`, `ja`, `zh-Hans`, …).

```
yourpass.pkpass/
├── pass.json
├── icon.png            ← non-localized image at root
├── logo.png            ← keep at root IF not localizing the logo
├── en.lproj/
│   ├── pass.strings
│   └── logo.png        ← localized English logo (then REMOVE logo.png from root)
└── es.lproj/
    ├── pass.strings
    └── logo.png
```

**`pass.strings` format** — one `"key" = "value";` per line:
```
"origin_SVQ" = "Seville";
"destination_LHR" = "London";
```
- The key on the left matches a string used as a `label`/`value` in `pass.json` (the field text becomes a lookup key).
- **Encoding:** ASCII is fine; files containing **non-ASCII characters must be saved as UTF-16**. **[VERIFIED]**

**Image localization rule** (verbatim): *"Images that need to be localized appear in the .lproj directories… Images that don't need localization appear at the top level… Don't include an image at the top level and inside a .lproj directory."* **[VERIFIED]**

### Practical guidance for Lovalte
- Localize **strings only** (labels like "POINTS", "TIER", back-field terms) → put a `pass.strings` in each `*.lproj`, keep all images at root. Simplest and covers most needs.
- Only localize images if your logo carries language-specific text.
