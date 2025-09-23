import { describe, expect, it } from 'vitest'

describe('getSfxText (__testHooks 暫定仕様)', () => {
  it('ローカルスコープのため __testHooks.getSfxText 実行でエラーになる (現段階仕様)', async () => {
    const mod: any = await import('@/services/application/layout-generation')
    expect(mod.__testHooks).toBeDefined()
    await expect(mod.__testHooks.getSfxText()).rejects.toThrow('scoped inside generateEpisodeLayout')
  })
})
