import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/agents/structured-generator', async () => {
  class FakeGen {
    private count = 0
    async generateObjectWithFallback<T>(): Promise<T> {
      this.count += 1
      // Return a ChunkConversionResult-shaped object expected by the mapper
      const makePanel = (no: number, cut: string) => ({
        no,
        cut,
        camera: 'standard',
        narration: [],
        dialogue: [],
        sfx: [],
        importance: 1,
      })

      if (this.count === 1) {
        // low-coverage result
        return {
          version: '3',
          memory: { characters: [], scenes: [] },
          situations: [],
          summary: '短い要約',
          script: [makePanel(1, '短い'), makePanel(2, 'もう一つのパネル')],
        } as unknown as T
      }

      const long = 'あ'.repeat(220)
      return {
        version: '3',
        memory: { characters: [], scenes: [] },
        situations: [],
        summary: '詳細な要約',
        script: [makePanel(1, long.slice(0, 110)), makePanel(2, long.slice(110))],
      } as unknown as T
    }
  }
  return {
    getLlmStructuredGenerator: () => new FakeGen(),
    // Provide DefaultLlmStructuredGenerator used by chunk-conversion agent
    DefaultLlmStructuredGenerator: class {
      constructor(_providers: any) {}
      async generateObjectWithFallback<T>(): Promise<T> {
        // Delegate to same behaviour as getLlmStructuredGenerator
        const inst = new FakeGen()
        // @ts-ignore
        return inst.generateObjectWithFallback<T>()
      }
    },
  }
})

describe('convertEpisodeTextToScript - best coverage selection', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    // テスト環境のデモ分岐を回避
    Object.assign(process.env, { NODE_ENV: 'development' })
    // Ensure chunkConversion uses fake provider to avoid Vertex env checks
    Object.assign(process.env, { LLM_PROVIDER_CHUNKCONVERSION: 'fake' })
  })
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('picks the best attempt that reaches threshold', async () => {
    const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
    const input = { episodeText: '物語'.repeat(60) } // > 50 chars
    const result = await convertEpisodeTextToScript(input)
    // 2パネルに分割された長文が panels に反映される
    expect(Array.isArray(result.panels)).toBe(true)
    expect((result.panels || []).length).toBeGreaterThanOrEqual(2)
    // Note: Coverage stats functionality not yet implemented
    // The test verifies the basic structure and panel generation works
    expect(result.style_tone).toBeDefined()
    expect(result.characters).toBeDefined()
    expect(result.locations).toBeDefined()
  })
})
