import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TTL 振る舞い検証: 環境変数で短縮しインスタンスの再生成を確認
describe("RepositoryFactory TTL (production semantics)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = "production";
    process.env.REPOSITORY_FACTORY_TTL_MS = "10"; // 10ms で高速検証
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("reuses instance within TTL and refreshes after TTL expiry", async () => {
    const { RepositoryFactory } = await import("@/repositories/factory");
    const f1 = RepositoryFactory.getInstance();
    const f2 = RepositoryFactory.getInstance();
    expect(f2).toBe(f1);
    await new Promise((r) => setTimeout(r, 15)); // TTL 経過
    const f3 = RepositoryFactory.getInstance();
    expect(f3).not.toBe(f1);
  });

  it("honors REPOSITORY_FACTORY_TTL_MS override value", async () => {
    process.env.REPOSITORY_FACTORY_TTL_MS = "50";
    const { RepositoryFactory } = await import("@/repositories/factory");
    const f1 = RepositoryFactory.getInstance();
    await new Promise((r) => setTimeout(r, 20)); // 50ms 未満
    const f2 = RepositoryFactory.getInstance();
    expect(f2).toBe(f1);
  });
});
