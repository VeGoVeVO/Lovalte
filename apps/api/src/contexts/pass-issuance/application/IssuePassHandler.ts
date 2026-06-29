import { randomBytes } from "node:crypto";
import {
  NotFoundError,
  ConflictError,
  type Result,
  ok,
  err,
  type Clock,
  type DomainEventBus,
} from "../../../kernel";
import { Pass } from "../domain/Pass";
import { SerialNumber } from "../domain/SerialNumber";
import { AuthenticationToken } from "../domain/AuthenticationToken";
import { PassDocumentBuilder } from "../domain/PassDocumentBuilder";
import { resolvePassImageRefs } from "../domain/resolveStripRef";
import type {
  IPassRepository,
  IPassTemplateRepository,
  IPassSigningPort,
  IPassBufferCache,
  PassFieldValueInput,
} from "../domain/ports";

export interface IssuePassCommand {
  memberId: string;
  passTypeId: string;
  tenantId: string;
  fieldValues?: PassFieldValueInput[];
}

export interface IssuePassDto {
  passId: string;
  serialNumber: string;
  memberId: string;
  createdAt: Date;
}

/**
 * IssuePassHandler
 *
 * Idempotent: returns existing pass for same (memberId, passTypeId, tenantId).
 * Signing via IPassSigningPort: throws DomainError if Apple certs not configured.
 */
export class IssuePassHandler {
  private readonly builder = new PassDocumentBuilder();

  constructor(
    private readonly passes: IPassRepository,
    private readonly templates: IPassTemplateRepository,
    private readonly signer: IPassSigningPort,
    private readonly cache: IPassBufferCache,
    private readonly clock: Clock,
    private readonly bus: DomainEventBus,
  ) {}

  async execute(cmd: IssuePassCommand): Promise<Result<IssuePassDto>> {
    // Idempotency: return existing pass if already issued for this member+template
    const existing = await this.passes.findByMemberAndType(
      cmd.memberId,
      cmd.passTypeId,
      cmd.tenantId,
    );
    if (existing) {
      return ok({
        passId: existing.id.value,
        serialNumber: existing.serialNumber.value,
        memberId: existing.memberId,
        createdAt: existing.createdAt,
      });
    }

    const template = await this.templates.findById(cmd.passTypeId, cmd.tenantId);
    if (!template) {
      return err(new NotFoundError("Pass template not found. Publish a card template first."));
    }
    if (template.tenantId !== cmd.tenantId) {
      return err(new ConflictError("Template belongs to a different tenant"));
    }

    // Mint identity
    const serial = SerialNumber.mint();
    const authToken = AuthenticationToken.fromRaw(randomBytes(32).toString("hex"));
    const now = this.clock.now();

    // Seed field values from the template so the pass actually carries its
    // fields (e.g. POINTS = 0). Without a seeded value the storeCard field is
    // empty and applyEarnedPoints (which maps existing values) has nothing to
    // update, so the balance would never appear on the pass.
    const fieldValues =
      cmd.fieldValues && cmd.fieldValues.length > 0
        ? cmd.fieldValues.map((fv) => ({ ...fv }))
        : template.fieldDefinitions.map((d) => ({
            key: d.key,
            label: d.label,
            value: (d.key === "points" || d.key === "balance" ? 0 : "") as string | number,
          }));
    const pass = Pass.issue({
      passTypeId: cmd.passTypeId,
      memberId: cmd.memberId,
      tenantId: cmd.tenantId,
      serialNumber: serial,
      authToken,
      fieldValues,
      now,
    });

    // Wallet barcode = the bare passId. Industry standard for loyalty cards:
    // a short, stable identifier → sparse (low-version) QR that scans reliably
    // off a phone screen. Trust/tenant-isolation lives in the staff-authed scan
    // endpoint, not in the barcode (a signed token only bloated the QR).
    const qrMessage = pass.id.value;

    // Build + sign pass document (throws DomainError if certs not configured).
    // resolvePassImageRefs swaps the stamp strip to strip_<earned> so the very
    // first issued+cached pass already shows its stamp grid (not just on a later
    // re-sign) — the same resolution every other signing path uses.
    const passJson = this.builder.build(pass, template, qrMessage);
    const buffer = await this.signer.sign(
      passJson as unknown as Record<string, unknown>,
      resolvePassImageRefs(pass, template),
    );

    // Cache signed buffer keyed by (serial, version)
    await this.cache.put(serial.value, pass.version, buffer);

    // Persist pass, then publish PassIssued so the Membership context enrols the
    // member and Analytics records it (one-aggregate-per-tx → publish after save).
    await this.passes.save(pass);
    await this.bus.publish(pass.pullEvents());

    return ok({
      passId: pass.id.value,
      serialNumber: serial.value,
      memberId: cmd.memberId,
      createdAt: now,
    });
  }
}
