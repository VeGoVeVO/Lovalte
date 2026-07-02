import type { Result } from "../../../kernel";
import { err, NotFoundError, ok, ValidationError } from "../../../kernel";
import type { IScanPreviewLookup, ScanPreview } from "./ports";

export interface GetScanPreviewQuery {
  readonly passId: string;
  readonly tenantId: string;
}

const PASS_ID_RE = /^[0-9a-fA-F-]{8,64}$/;

/**
 * Returns the compact staff-facing details for a captured wallet QR.
 */
export class GetScanPreviewHandler {
  constructor(private readonly lookup: IScanPreviewLookup) {}

  async execute(query: GetScanPreviewQuery): Promise<Result<ScanPreview>> {
    const passId = query.passId.trim();
    if (!PASS_ID_RE.test(passId)) {
      return err(new ValidationError("Unrecognized QR code"));
    }

    const preview = await this.lookup.findPreview(passId, query.tenantId);
    if (!preview) {
      return err(new NotFoundError("Card not found for this business"));
    }

    return ok(preview);
  }
}
