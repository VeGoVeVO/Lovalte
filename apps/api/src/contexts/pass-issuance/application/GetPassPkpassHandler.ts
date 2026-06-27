import { NotFoundError, UnauthorizedError, type Result, ok, err } from "../../../kernel";
import { PassDocumentBuilder } from "../domain/PassDocumentBuilder";
import type {
  IPassRepository,
  IPassTemplateRepository,
  IPassSigningPort,
  IPassBufferCache,
} from "../domain/ports";

export interface GetPassPkpassCommand {
  passId: string;
  tenantId: string;
  /** Value from If-Modified-Since header (optional). */
  ifModifiedSince?: Date;
}

export type GetPassPkpassResult =
  | { status: 200; buffer: Buffer; lastModified: string }
  | { status: 304 };

/**
 * Returns the signed .pkpass buffer for a given pass.
 *
 * Lookup order:
 *   1. In-memory Redis cache keyed by (serial, version).
 *   2. On cache miss: rebuild pass.json + sign + re-cache.
 *
 * Serves If-Modified-Since / 304 for conditional GET.
 */
export class GetPassPkpassHandler {
  private readonly builder = new PassDocumentBuilder();

  constructor(
    private readonly passes: IPassRepository,
    private readonly templates: IPassTemplateRepository,
    private readonly signer: IPassSigningPort,
    private readonly cache: IPassBufferCache,
  ) {}

  async execute(cmd: GetPassPkpassCommand): Promise<Result<GetPassPkpassResult>> {
    const pass = await this.passes.findById(cmd.passId, cmd.tenantId);
    if (!pass) return err(new NotFoundError("Pass not found"));

    // Conditional GET: return 304 if not modified
    if (cmd.ifModifiedSince && pass.lastUpdated <= cmd.ifModifiedSince) {
      return ok({ status: 304 });
    }

    const lastModified = pass.lastUpdated.toUTCString();

    // Check cache first
    const cached = await this.cache.get(pass.serialNumber.value, pass.version);
    if (cached) {
      return ok({ status: 200, buffer: cached, lastModified });
    }

    // Cache miss: rebuild and sign
    const template = await this.templates.findById(pass.passTypeId, cmd.tenantId);
    if (!template) {
      return err(new NotFoundError("Pass template not found"));
    }

    // Wallet barcode = the bare passId (same as IssuePassHandler) — short → sparse
    // QR that scans reliably; the staff-authed scan endpoint resolves it.
    const qrMessage = pass.id.value;
    const passJson  = this.builder.build(pass, template, qrMessage);
    const buffer    = await this.signer.sign(
      passJson as unknown as Record<string, unknown>,
      template.imageAssetRefs,
    );

    await this.cache.put(pass.serialNumber.value, pass.version, buffer);

    return ok({ status: 200, buffer, lastModified });
  }
}
