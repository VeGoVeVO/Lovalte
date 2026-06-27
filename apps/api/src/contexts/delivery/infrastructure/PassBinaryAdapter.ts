import type { IPassBinaryPort } from "../domain/ports";

/**
 * Stub S3 binary adapter.
 *
 * TODO: Replace with a real implementation using the AWS SDK v3 GetObjectCommand
 * (or compatible S3-compatible client). Read the signed .pkpass buffer uploaded
 * to the `pkpass_s3_key` path by the pass-issuance context after signing.
 *
 * Example real implementation skeleton:
 *   const { GetObjectCommand } = require("@aws-sdk/client-s3");
 *   const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: s3Key }));
 *   return Buffer.from(await response.Body.transformToByteArray());
 */
export class PassBinaryAdapter implements IPassBinaryPort {
  async get(_s3Key: string): Promise<Buffer | null> {
    // TODO: fetch from S3 — return null triggers a 503 in the route layer.
    return null;
  }
}
