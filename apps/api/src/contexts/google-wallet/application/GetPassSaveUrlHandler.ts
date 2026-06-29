import { ok, err, NotFoundError } from "../../../kernel";
import type { Result } from "../../../kernel";
import { HexColor } from "../domain/HexColor";
import type {
  IGoogleWalletPassRepo,
  IGoogleWalletRestClient,
  IGoogleWalletJwtService,
} from "../domain/ports";

export interface GetPassSaveUrlCommand {
  passId: string;
  tenantId: string;
}

export interface GetPassSaveUrlDto {
  saveUrl: string;
}

export class GetPassSaveUrlHandler {
  constructor(
    private readonly passRepo: IGoogleWalletPassRepo,
    private readonly gwClient: IGoogleWalletRestClient,
    private readonly jwtService: IGoogleWalletJwtService,
    private readonly issuerId: string,
    private readonly publicBaseUrl: string,
  ) {}

  /** Google requires absolute public HTTPS image URLs; stored refs are app-relative
   *  ("/api/v1/images/:id") or blank. Blank → undefined (field omitted). */
  private absUri(ref?: string): string | undefined {
    if (!ref || !ref.trim()) return undefined;
    if (/^https?:\/\//i.test(ref)) return ref;
    const base = this.publicBaseUrl.replace(/\/$/, "");
    return `${base}${ref.startsWith("/") ? "" : "/"}${ref}`;
  }

  async execute(cmd: GetPassSaveUrlCommand): Promise<Result<GetPassSaveUrlDto>> {
    const pass = await this.passRepo.findPassWithTemplate(cmd.passId, cmd.tenantId);
    if (!pass) return err(new NotFoundError("Pass not found"));

    const classId = `${this.issuerId}.template_${pass.passTypeId}`;
    let objectId = pass.googleWalletObjectId;

    if (!objectId) {
      objectId = `${this.issuerId}.pass_${pass.passId}`;
      const hexBg = HexColor.fromRgbString(pass.backgroundColorRgb).value;
      const primary = pass.fieldValues[0];

      await this.gwClient.ensureClass(classId);
      await this.gwClient.createObject(objectId, classId, {
        hexBackgroundColor: hexBg,
        cardTitle: pass.organizationName,
        header: pass.logoText ?? pass.organizationName,
        barcode: pass.passId,
        logoImageUri: pass.imageAssetRefs["logo"],
        heroImageUri: pass.imageAssetRefs["strip"],
        textModulesData: primary
          ? [{ header: primary.label, body: String(primary.value), id: "balance" }]
          : [],
      });
      await this.passRepo.saveGwObjectId(pass.passId, cmd.tenantId, objectId);
    }

    return ok({ saveUrl: this.jwtService.buildSaveUrl(objectId) });
  }
}
