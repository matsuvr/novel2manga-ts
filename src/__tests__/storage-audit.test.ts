import { promises as fs } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isDevelopment } from "@/config";
import {
  auditStorageKeys,
  LocalFileStorage,
  StorageFactory,
} from "../utils/storage";

vi.mock("@/config", () => ({ isDevelopment: vi.fn() }));

describe("storage audit", () => {
  beforeEach(() => {
    vi.mocked(isDevelopment).mockReturnValue(true);
  });

  it("detects invalid format keys", async () => {
    const basePath = path.join(process.cwd(), ".test-storage", "novels");
    await fs.rm(basePath, { recursive: true, force: true });
    const storage = new LocalFileStorage(basePath);
    await storage.put("novels/valid-1.json", "{}");
    await storage.put("novels/.DS_Store", "{}");
    const result = await auditStorageKeys({
      storages: ["getNovelStorage"],
      prefix: "novels",
    });
    expect(result.scanned).toBeGreaterThanOrEqual(2);
    expect(result.issues.some((i) => i.key.includes(".DS_Store"))).toBe(true);
  });
});
