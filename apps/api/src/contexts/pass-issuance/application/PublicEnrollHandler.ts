import { randomUUID } from "node:crypto";
import { ok, err, UnauthorizedError, type Result, type Clock } from "../../../kernel";
import type { AppConfig } from "../../../config/env";
import type { IssuePassHandler } from "./IssuePassHandler";
import { signToken, verifyToken } from "./enrollTokens";

export interface PublicEnrollInput {
  token: string;
}

export interface PublicEnrollDto {
  passId: string;
  serialNumber: string;
  /** Capability token for the public .pkpass download (no session required). */
  downloadToken: string;
}

/**
 * Self-service enrollment: verifies the signed enrollment token, generates a
 * fresh unique member id (UUID — collision-free, never typed by a human), issues
 * the pass, and returns a download token so the customer can fetch their
 * .pkpass without an account.
 */
export class PublicEnrollHandler {
  constructor(
    private readonly issuePass: IssuePassHandler,
    private readonly config: AppConfig,
    private readonly clock: Clock,
  ) {}

  async execute(input: PublicEnrollInput): Promise<Result<PublicEnrollDto>> {
    const claims = verifyToken(this.config.QR_TOKEN_SECRET, input.token, "enroll");
    if (!claims || !claims.templateId || !claims.tenantId) {
      return err(new UnauthorizedError("Invalid or expired enrollment link"));
    }

    const memberId = randomUUID();
    const r = await this.issuePass.execute({
      memberId,
      passTypeId: claims.templateId,
      tenantId: claims.tenantId,
    });
    if (!r.ok) return err(r.error);

    const downloadToken = signToken(
      this.config.QR_TOKEN_SECRET,
      { typ: "download", passId: r.value.passId, tenantId: claims.tenantId },
      Math.floor(this.clock.now().getTime() / 1000),
    );
    return ok({ passId: r.value.passId, serialNumber: r.value.serialNumber, downloadToken });
  }
}
