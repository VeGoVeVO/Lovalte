import { NotFoundError, ok, err, type Result } from "../../../kernel";
import type { IImageRepository } from "./IImageRepository";

export interface ServedImage {
  contentType: string;
  bytes: Buffer;
  byteSize: number;
}

/** Load image bytes for public serving (GET /api/v1/images/:id). */
export class GetImageHandler {
  constructor(private readonly repo: IImageRepository) {}

  async execute(id: string): Promise<Result<ServedImage>> {
    const found = await this.repo.load(id);
    if (!found) return err(new NotFoundError("Image not found"));
    return ok({
      contentType: found.image.contentType,
      bytes: found.bytes,
      byteSize: found.image.byteSize,
    });
  }
}
