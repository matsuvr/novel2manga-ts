import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/agents/structured-generator', async () => {
  class FakeGen {
    private count = 0
    async generateObjectWithFallback<T>(): Promise<T> {
      this.count += 1
      if (this.count === 1) {
        // 少ない行（低カバレッジ）
        return {
          title: 'v1',
          script: [{ sceneIndex: 1, type: 'narration', text: '短い' }],
        } as unknown as T
      }
      // 多い行（高カバレッジ目標）
      const long = 'あ'.repeat(220)
      return {
        title: 'v2',
        script: [
          { sceneIndex: 1, type: 'narration', text: long.slice(0, 110) },
          { sceneIndex: 1, type: 'narration', text: long.slice(110) },
        ],
      } as unknown as T
    }
  }
  return {
    getLlmStructuredGenerator: () => new FakeGen(),
  }
})

describe('convertEpisodeTextToScript - best coverage selection', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    // テスト環境のデモ分岐を回避
    process.env.NODE_ENV = 'development'
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('picks the best attempt that reaches threshold', async () => {
    const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
    const input = { episodeText: '物語'.repeat(60) } // > 50 chars
    const result = await convertEpisodeTextToScript(input)
    // 2行に分割された長文が scenes に反映される
    expect(Array.isArray(result.scenes)).toBe(true)
    const lines = (result.scenes || []).flatMap((s) => s.script || [])
    expect(lines.length).toBeGreaterThanOrEqual(2)
    // coverageStats が付与され、needsRetry は false になる見込み
    const meta = result as unknown as {
      coverageStats?: { coverageRatio?: number }
      needsRetry?: boolean
    }
    expect(typeof meta.coverageStats?.coverageRatio).toBe('number')
    expect(meta.needsRetry).toBe(false)
  })
})
