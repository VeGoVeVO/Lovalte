// ── Stamp-card strip rendering ───────────────────────────────────────────────
// Apple Wallet has no native stamp-grid widget: the grid must be baked into the
// strip image. We render one strip per "stamps earned" count in the browser
// (the same layout the live preview draws), upload them, and the server swaps
// strip = strip_<earned> at sign time. Zero server-side image dependency.

import { hexToRgb } from "./cardDoc";

/**
 * Apple storeCard strip @3x. A storeCard with NO primary fields (our stamp cards
 * carry the count BELOW the strip, so primaryFields is empty) gets the TALLER
 * 375×144 pt strip = 1125×432 px. Using the 369 (123 pt, with-primary) height made
 * Wallet aspect-fill the image taller and crop ~32 pt off each side on-device, so
 * stamps were clipped left/right. 432 matches what Wallet actually renders.
 */
export const STRIP_W = 1125;
export const STRIP_H = 432;
/** Preview band aspect (height = width * this) — matches the generated strip. */
export const STRIP_RATIO = STRIP_H / STRIP_W;
/**
 * Apple storeCard strip WITH primary fields = the SHORTER 375×123 pt band
 * (@3x 1125×369): Wallet overlays the primary label/value on the strip and
 * reserves the difference for it. Points/cashback cards (whose loyalty counter
 * is a primaryField) must bake and preview at this aspect, or Wallet
 * aspect-fills and side-crops on-device — the mirror image of the 432 note above.
 */
export const STRIP_H_PRIMARY = 369;
export const STRIP_RATIO_PRIMARY = STRIP_H_PRIMARY / STRIP_W;
/**
 * Small side margin for the stamp grid. The count ("X / N") now lives in a field
 * BELOW the strip (not overlaid on the left), so the grid spans the full strip.
 * Shared by the renderer and the preview so they line up.
 */
export const GRID_LEFT = 0.06;

export const STAMPS_MAX = 20;

/**
 * Grid shape for `goal` stamps (1–20): one row up to 5, otherwise two rows. Cols
 * grow (up to 10) as the goal rises, and the mark radius is derived from the cell
 * size — so more stamps simply render smaller and always fit the thin strip.
 * Shared by the DOM preview and the canvas renderer so the two never drift. Pure.
 * Invariant: cols*rows ≥ goal (every stamp fits).
 */
export function stampLayout(goal: number): { cols: number; rows: number } {
  const n = Math.max(1, Math.min(STAMPS_MAX, Math.trunc(goal) || 1));
  const rows = n <= 5 ? 1 : 2;
  return { cols: Math.ceil(n / rows), rows };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // same-origin refs, but keep the canvas untainted
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image: ${src}`));
    img.src = src;
  });
}

/**
 * Bake the preview's pan/zoom into real pixels. Replicates ImgSlot's CSS
 * exactly — object-fit: cover into the W×H box FIRST, then
 * translate(tx*18%, ty*18%) scale(scale) about the box centre, cropped by the
 * box — so the uploaded strip/logo equals what the merchant saw. Returns a PNG
 * data URL; throws if the image can't load (caller falls back to the original).
 */
export async function bakeCropToPng(
  src: string,
  w: number,
  h: number,
  t: { tx: number; ty: number; scale: number },
): Promise<string> {
  const img = await loadImage(src);
  // Stage 1: cover-fit into the box (what object-fit renders inside the element).
  const covered = document.createElement("canvas");
  covered.width = w;
  covered.height = h;
  const cctx = covered.getContext("2d");
  if (!cctx) throw new Error("canvas 2d unavailable");
  drawCover(cctx, img, w, h);
  // Stage 2: CSS transform of the element box — translate then scale, origin centre.
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) throw new Error("canvas 2d unavailable");
  octx.translate(w / 2 + t.tx * 0.18 * w, h / 2 + t.ty * 0.18 * h);
  octx.scale(t.scale, t.scale);
  octx.drawImage(covered, -w / 2, -h / 2);
  return out.toDataURL("image/png");
}

export interface StampStripInput {
  goal: number;
  /** Theme colours as hex (#rrggbb). */
  bg: string;
  fg: string;
  /** Optional background image ref drawn cover-fit behind the stamps. */
  bgRef?: string | null;
  /** Stamp icon pre-rendered in the FOREGROUND colour (the faint, not-yet-earned
   *  mark) and in the BACKGROUND colour (knocked out of the filled, earned disc). */
  stampIconFgPng?: string | null;
  stampIconBgPng?: string | null;
  /** Uploaded stamp art refs that override the Lucide icon (optional). */
  stampedRef?: string | null;
  unstampedRef?: string | null;
}

/** Draw an image to cover WxH, centred (object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/**
 * Draw one stamp mark. Unstamped = the chosen icon, faint (so a fresh card still
 * reads as "coffee x N"); stamped = a filled disc with the icon knocked out in
 * the background colour (highlighted). Uploaded art replaces both states. With no
 * icon at all it degrades to a faint ring / filled disc.
 */
function drawMark(
  ctx: CanvasRenderingContext2D,
  earned: boolean,
  cx: number,
  cy: number,
  r: number,
  fg: string,
  art: HTMLImageElement | null,
  iconFg: HTMLImageElement | null,
  iconBg: HTMLImageElement | null,
) {
  if (art) {
    const s = r * 2;
    ctx.drawImage(art, cx - r, cy - r, s, s);
    return;
  }
  if (earned) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fg;
    ctx.fill();
    if (iconBg) {
      const s = r * 1.15;
      ctx.drawImage(iconBg, cx - s / 2, cy - s / 2, s, s);
    }
  } else if (iconFg) {
    ctx.globalAlpha = 0.4;
    const s = r * 1.7;
    ctx.drawImage(iconFg, cx - s / 2, cy - s / 2, s, s);
    ctx.globalAlpha = 1;
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, r * 0.13);
    ctx.strokeStyle = fg;
    ctx.globalAlpha = 0.4;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/**
 * Render one strip per earned-count (0..goal). Returns PNG data URLs indexed by
 * earned — frames[n] shows n filled stamps. The native "X / N" primary field is
 * drawn by Wallet on top, so the strip carries only the grid.
 */
export async function renderStampFrames(input: StampStripInput): Promise<string[]> {
  const goal = Math.max(1, Math.min(STAMPS_MAX, Math.trunc(input.goal) || 1));
  const fg = hexToRgb(input.fg);
  const bg = hexToRgb(input.bg);

  const [bgImg, stampedArt, unstampedArt, iconFg, iconBg] = await Promise.all([
    input.bgRef ? loadImage(input.bgRef).catch(() => null) : null,
    input.stampedRef ? loadImage(input.stampedRef).catch(() => null) : null,
    input.unstampedRef ? loadImage(input.unstampedRef).catch(() => null) : null,
    input.stampIconFgPng ? loadImage(input.stampIconFgPng).catch(() => null) : null,
    input.stampIconBgPng ? loadImage(input.stampIconBgPng).catch(() => null) : null,
  ]);

  // The count is shown as a field below the strip, so the grid spans the full
  // strip (small GRID_LEFT margin). Must match CardCanvas's StampGrid so the
  // preview equals the issued card.
  const { cols, rows } = stampLayout(goal);
  const gridLeft = STRIP_W * GRID_LEFT;
  const gridRight = STRIP_W * 0.96;
  const gridTop = STRIP_H * 0.14;
  const gridBottom = STRIP_H * 0.86;
  const cellW = (gridRight - gridLeft) / cols;
  const cellH = (gridBottom - gridTop) / rows;
  const r = Math.min(cellW, cellH) * 0.36;

  const canvas = document.createElement("canvas");
  canvas.width = STRIP_W;
  canvas.height = STRIP_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const frames: string[] = [];
  for (let earned = 0; earned <= goal; earned++) {
    ctx.clearRect(0, 0, STRIP_W, STRIP_H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STRIP_W, STRIP_H);
    if (bgImg) drawCover(ctx, bgImg, STRIP_W, STRIP_H);
    for (let i = 0; i < goal; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const rowCount = Math.min(cols, goal - row * cols); // centre a short last row
      const rowPad = ((cols - rowCount) * cellW) / 2;
      const cx = gridLeft + rowPad + cellW * col + cellW / 2;
      const cy = gridTop + cellH * row + cellH / 2;
      drawMark(
        ctx,
        i < earned,
        cx,
        cy,
        r,
        fg,
        i < earned ? stampedArt : unstampedArt,
        iconFg,
        iconBg,
      );
    }
    frames.push(canvas.toDataURL("image/png"));
  }
  return frames;
}
