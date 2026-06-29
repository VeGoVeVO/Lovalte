import { google } from "googleapis";
import type { IGoogleWalletRestClient, GwObjectData, GwObjectPatch } from "../domain/ports";

const TIMEOUT_MS = 10_000;

function is404(e: unknown): boolean {
  const code =
    (e as { code?: number }).code ??
    (e as { response?: { status?: number } }).response?.status;
  return code === 404;
}

export class GoogleWalletRestClient implements IGoogleWalletRestClient {
  private _wallet: ReturnType<typeof google.walletobjects> | null = null;

  constructor(private readonly serviceAccountJson: string) {}

  private async wallet(): Promise<ReturnType<typeof google.walletobjects>> {
    if (!this._wallet) {
      const credentials = JSON.parse(this.serviceAccountJson) as Record<string, string>;
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
      });
      this._wallet = google.walletobjects({ version: "v1", auth });
    }
    return this._wallet;
  }

  async ensureClass(classId: string): Promise<void> {
    const w = await this.wallet();
    try {
      await w.genericclass.get({ resourceId: classId }, { timeout: TIMEOUT_MS });
    } catch (e: unknown) {
      if (!is404(e)) throw e;
      await w.genericclass.insert(
        { requestBody: { id: classId } },
        { timeout: TIMEOUT_MS },
      );
    }
  }

  async createObject(objectId: string, classId: string, data: GwObjectData): Promise<void> {
    const w = await this.wallet();
    await w.genericobject.insert(
      {
        requestBody: {
          id: objectId,
          classId,
          state: "ACTIVE",
          hexBackgroundColor: data.hexBackgroundColor,
          cardTitle: { defaultValue: { language: "en-US", value: data.cardTitle } },
          header: { defaultValue: { language: "en-US", value: data.header } },
          barcode: { type: "QR_CODE", value: data.barcode },
          ...(data.logoImageUri
            ? { logo: { sourceUri: { uri: data.logoImageUri } } }
            : {}),
          ...(data.heroImageUri
            ? { heroImage: { sourceUri: { uri: data.heroImageUri } } }
            : {}),
          textModulesData: data.textModulesData,
        },
      },
      { timeout: TIMEOUT_MS },
    );
  }

  async patchObject(objectId: string, patch: GwObjectPatch): Promise<void> {
    const w = await this.wallet();
    await w.genericobject.patch(
      { resourceId: objectId, requestBody: patch },
      { timeout: TIMEOUT_MS },
    );
  }
}
