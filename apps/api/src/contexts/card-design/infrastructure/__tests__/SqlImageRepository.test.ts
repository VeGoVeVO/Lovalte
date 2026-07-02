import { describe, it, expect, vi, afterAll } from "vitest";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { SqlImageRepository } from "../SqlImageRepository";

function makePool(rows: unknown[]): Pool {
  return {
    query: vi.fn(async () => ({ rows })),
  } as unknown as Pool;
}

describe("SqlImageRepository.exists", () => {
  it("resolves true when a /api/v1/images/:id ref has a matching card_images row", async () => {
    const repo = new SqlImageRepository(makePool([{ ok: 1 }]));
    const ok = await repo.exists("/api/v1/images/11111111-1111-1111-1111-111111111111");
    expect(ok).toBe(true);
  });

  it("resolves false when a /api/v1/images/:id ref has no matching row", async () => {
    const repo = new SqlImageRepository(makePool([]));
    const ok = await repo.exists("/api/v1/images/11111111-1111-1111-1111-111111111111");
    expect(ok).toBe(false);
  });

  describe("legacy filesystem refs", () => {
    const filePath = join(tmpdir(), `sql-image-repo-exists-test-${process.pid}.png`);

    afterAll(async () => {
      await unlink(filePath).catch(() => {});
    });

    it("resolves true for a readable file path", async () => {
      await writeFile(filePath, Buffer.from("fake bytes"));
      // Pool must never be queried for a non-DB ref.
      const repo = new SqlImageRepository(makePool([]));
      const ok = await repo.exists(filePath);
      expect(ok).toBe(true);
    });

    it("resolves false for an unreadable/non-existent file path", async () => {
      const repo = new SqlImageRepository(makePool([]));
      const ok = await repo.exists(join(tmpdir(), "sql-image-repo-exists-test-missing.png"));
      expect(ok).toBe(false);
    });
  });
});
