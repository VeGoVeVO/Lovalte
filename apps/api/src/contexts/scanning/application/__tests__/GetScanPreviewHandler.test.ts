import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "../../../../kernel";
import { GetScanPreviewHandler } from "../GetScanPreviewHandler";
import type { IScanPreviewLookup, ScanPreview } from "../ports";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PASS_ID = "22222222-2222-4222-8222-222222222222";

const preview: ScanPreview = {
  passId: PASS_ID,
  cardName: "FuelPlus",
  cardType: "Apple Wallet loyalty card",
  member: {
    id: "33333333-3333-4333-8333-333333333333",
    displayName: "Pat Kim",
    email: "pat@example.com",
    balance: 12,
    tier: "bronze",
    status: "active",
    enrolledAt: "2026-06-01T10:00:00.000Z",
  },
};

function makeLookup(result: ScanPreview | null): IScanPreviewLookup {
  return {
    findPreview: vi.fn().mockResolvedValue(result),
  };
}

describe("GetScanPreviewHandler", () => {
  it("returns a staff-safe member/card preview for a valid pass", async () => {
    const lookup = makeLookup(preview);
    const result = await new GetScanPreviewHandler(lookup).execute({
      passId: PASS_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(preview);
    expect(lookup.findPreview).toHaveBeenCalledWith(PASS_ID, TENANT_ID);
  });

  it("rejects non-pass QR payloads before lookup", async () => {
    const lookup = makeLookup(preview);
    const result = await new GetScanPreviewHandler(lookup).execute({
      passId: "https://example.com/random",
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(lookup.findPreview).not.toHaveBeenCalled();
  });

  it("returns NotFoundError when the pass is unknown or foreign", async () => {
    const result = await new GetScanPreviewHandler(makeLookup(null)).execute({
      passId: PASS_ID,
      tenantId: TENANT_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(NotFoundError);
  });
});
