import type { Pass } from "./Pass";
import type { PassTemplateDto } from "./ports";

/**
 * Resolve the image refs for THIS pass at sign time.
 *
 * For a stamp card the strip swaps to the pre-rendered frame matching the live
 * stamps-earned count (`strip_<earned>`); every other card type is returned
 * unchanged. Pure — and used by EVERY signing path (initial issue + every
 * re-sign), so a freshly issued pass and an updated one always render the same
 * stamp grid. (The bug this fixes: the issue path signed + cached the base strip,
 * so a just-added stamp card showed no stamps until a much later re-sign.)
 */
export function resolvePassImageRefs(
  pass: Pass,
  template: PassTemplateDto,
): Record<string, string> {
  const refs = template.imageAssetRefs;
  const stampDef = template.fieldDefinitions.find((d) => d.loyaltyType === "stamps");
  if (!stampDef) return refs;
  const goal = stampDef.loyaltyGoal ?? 10;
  const raw = pass.fieldValues.find((v) => v.key === stampDef.key)?.value;
  const earned = Math.min(Math.max(Math.trunc(Number(raw) || 0), 0), goal);
  const frame = refs[`strip_${earned}`];
  return frame ? { ...refs, strip: frame } : refs;
}
