import { createSign } from "node:crypto";
import { DomainError } from "../../../kernel";
import type { IGoogleWalletJwtService } from "../domain/ports";

/** Signs a thin RS256 JWT for the Google Wallet "Add to Wallet" save URL.
 *  Uses node:crypto — no jsonwebtoken dep needed. */
export class GoogleWalletJwtService implements IGoogleWalletJwtService {
  private readonly privateKeyPem: string;
  private readonly issuerEmail: string;

  constructor(
    serviceAccountJson: string,
    private readonly allowedOrigins: string[],
  ) {
    const sa = JSON.parse(serviceAccountJson) as {
      private_key: string;
      client_email: string;
    };
    this.privateKeyPem = sa.private_key;
    this.issuerEmail = sa.client_email;
  }

  buildSaveUrl(objectId: string): string {
    const claims = {
      iss: this.issuerEmail,
      aud: "google",
      typ: "savetowallet",
      iat: Math.floor(Date.now() / 1000),
      origins: this.allowedOrigins,
      payload: { genericObjects: [{ id: objectId }] },
    };

    const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const body    = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const msg     = `${header}.${body}`;
    const sig     = createSign("RSA-SHA256").update(msg).sign(this.privateKeyPem, "base64url");
    const token   = `${msg}.${sig}`;
    const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

    if (saveUrl.length > 1800) {
      throw new DomainError(
        "Google Wallet save URL exceeds 1800-char browser limit",
        "GW_URL_TOO_LONG",
      );
    }
    return saveUrl;
  }
}
