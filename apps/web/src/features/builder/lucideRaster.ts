/**
 * Rasterise a rendered Lucide <svg> into a PNG data URL.
 *
 * Apple Wallet pass images must be PNG (no SVG), so when a merchant picks a
 * Lucide icon we snapshot the already-rendered SVG node, recolour it to the
 * card's foreground colour, and draw it onto a canvas at @3x (87px) for crisp
 * Retina display. The resulting data URL is uploaded to the card-image store.
 */
export async function svgToPngDataUrl(
  svg: SVGSVGElement,
  size = 87,
  color = "#111111",
): Promise<string> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(size));
  clone.setAttribute("height", String(size));
  // Lucide strokes use `currentColor`; set the CSS color so it resolves when the
  // SVG is rasterised standalone (otherwise it defaults to black).
  clone.setAttribute("style", `color:${color}`);

  const xml = new XMLSerializer().serializeToString(clone);
  // Unicode-safe base64 (icon names/markup are ASCII, but be defensive).
  const svgDataUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(xml)));

  const img = new Image(size, size);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to rasterise icon"));
    img.src = svgDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}
