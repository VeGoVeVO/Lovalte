import { GoogleAuth } from "google-auth-library";
import type { IGoogleWalletRestClient, GwObjectData, GwObjectPatch } from "../domain/ports";

const BASE = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPES = ["https://www.googleapis.com/auth/wallet_object.issuer"];
const TIMEOUT_MS = 10_000;

export class GoogleWalletRestClient implements IGoogleWalletRestClient {
  private _auth: GoogleAuth | null = null;

  constructor(private readonly serviceAccountJson: string) {}

  private auth(): GoogleAuth {
    if (!this._auth) {
      this._auth = new GoogleAuth({
        credentials: JSON.parse(this.serviceAccountJson) as object,
        scopes: SCOPES,
      });
    }
    return this._auth;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const client = await this.auth().getClient();
    const headers = await client.getRequestHeaders();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(`${BASE}${path}`, {
        method,
        headers: { ...headers, "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }

  async ensureClass(classId: string): Promise<void> {
    const res = await this.request("GET", `/genericClass/${encodeURIComponent(classId)}`);
    if (res.status === 404) {
      const ins = await this.request("POST", "/genericClass", { id: classId });
      if (!ins.ok) throw new Error(`GW createClass ${ins.status}: ${await ins.text()}`);
      return;
    }
    if (!res.ok) throw new Error(`GW getClass ${res.status}: ${await res.text()}`);
  }

  async createObject(objectId: string, classId: string, data: GwObjectData): Promise<void> {
    const res = await this.request("POST", "/genericObject", {
      id: objectId,
      classId,
      state: "ACTIVE",
      hexBackgroundColor: data.hexBackgroundColor,
      cardTitle: { defaultValue: { language: "en-US", value: data.cardTitle } },
      header: { defaultValue: { language: "en-US", value: data.header } },
      barcode: { type: "QR_CODE", value: data.barcode },
      ...(data.logoImageUri ? { logo: { sourceUri: { uri: data.logoImageUri } } } : {}),
      ...(data.heroImageUri ? { heroImage: { sourceUri: { uri: data.heroImageUri } } } : {}),
      textModulesData: data.textModulesData,
    });
    // 409 = object already exists (idempotent retry, or the DB write failed after a
    // prior successful create). Treat as success and let the caller build the save URL.
    if (res.status === 409) return;
    if (!res.ok) throw new Error(`GW createObject ${res.status}: ${await res.text()}`);
  }

  async patchObject(objectId: string, patch: GwObjectPatch): Promise<void> {
    // Map the flat patch to Google's genericObject shape (logo/heroImage are nested
    // sourceUri objects, like createObject). PATCH merges, so we only send what's set.
    const body: Record<string, unknown> = {};
    if (patch.textModulesData !== undefined) body.textModulesData = patch.textModulesData;
    if (patch.state !== undefined) body.state = patch.state;
    if (patch.logoImageUri) body.logo = { sourceUri: { uri: patch.logoImageUri } };
    if (patch.heroImageUri) body.heroImage = { sourceUri: { uri: patch.heroImageUri } };
    const res = await this.request("PATCH", `/genericObject/${encodeURIComponent(objectId)}`, body);
    if (!res.ok) throw new Error(`GW patchObject ${res.status}: ${await res.text()}`);
  }
}
