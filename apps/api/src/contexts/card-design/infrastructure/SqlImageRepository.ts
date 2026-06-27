import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../../../db/pool";
import { CardImage, CardImageId, type CardImageProps, type AllowedImageType, type ImageKind, type ImageSource } from "../domain/CardImage";
import type { IImageRepository, StoredImage } from "../application/IImageRepository";

export class SqlImageRepository implements IImageRepository {
  constructor(private readonly pool: Pool) {}

  async save(image: CardImage, bytes: Buffer): Promise<void> {
    await withTransaction(this.pool, async (client: PoolClient) => {
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [image.tenantId]);
      await client.query(
        `INSERT INTO card_images
           (id, tenant_id, kind, content_type, byte_size, sha256, source, bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          image.id.value,
          image.tenantId,
          image.kind,
          image.contentType,
          image.byteSize,
          image.sha256,
          image.source,
          bytes,
          image.createdAt,
        ]
      );
    });
  }

  async load(id: string): Promise<StoredImage | null> {
    const res = await this.pool.query<Record<string, unknown>>(
      `SELECT id, tenant_id, kind, content_type, byte_size, sha256, source, bytes, created_at
       FROM card_images
       WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    const props: CardImageProps = {
      tenantId: row.tenant_id as string,
      kind: row.kind as ImageKind,
      contentType: row.content_type as AllowedImageType,
      byteSize: row.byte_size as number,
      sha256: row.sha256 as string,
      source: row.source as ImageSource,
      createdAt: row.created_at as Date,
    };
    return {
      image: CardImage.reconstitute(CardImageId.of(row.id as string), props),
      bytes: row.bytes as Buffer, // pg returns BYTEA as Buffer
    };
  }
}
