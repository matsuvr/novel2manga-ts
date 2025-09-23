import { describe, expect, it } from 'vitest'
import { ChunkConversionSchema } from '@/validation/chunk-conversion'

describe('ChunkConversionSchema version compatibility', () => {
  it('accepts legacy narrative version 3', () => {
    const parsed = ChunkConversionSchema.safeParse({
      version: '3',
      memory: { characters: [], scenes: [] },
      situations: [],
      summary: 'テスト要約',
      script: [
        { no: 1, cut: 'テスト', camera: 'WS', narration: [], dialogue: [], sfx: [], importance: 1 },
      ],
    })
    expect(parsed.success).toBe(true)
  })

  it('accepts explainer-v1 version', () => {
    const parsed = ChunkConversionSchema.safeParse({
      version: 'explainer-v1',
      memory: { characters: [], scenes: [] },
      situations: [],
      summary: '要約',
      script: [
        { no: 1, cut: '説明', camera: 'WS', narration: [], dialogue: [], sfx: [], importance: 1 },
      ],
    })
    expect(parsed.success).toBe(true)
  })
})
