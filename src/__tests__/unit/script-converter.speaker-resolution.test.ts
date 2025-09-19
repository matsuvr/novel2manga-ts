import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalEnv = { ...process.env }

const fakeChunkConversionResult = {
  version: '3',
  memory: {
    characters: [
      {
        id: 'c1',
        name: '山田太郎',
        aliases: ['太郎'],
        description: '主人公である高校生。',
        firstAppearanceChunk: 0,
        firstAppearance: 0,
        possibleMatchIds: [],
      },
    ],
    scenes: [],
  },
  situations: [],
  summary: 'テスト用の要約',
  script: [
    {
      no: 1,
      cut: '教室の全景',
      camera: 'WS',
      narration: [],
      dialogue: [
        {
          type: 'speech',
          speaker: 'c1',
          text: 'みんな、準備はいいか？',
        },
        {
          type: 'thought',
          speaker: 'c1',
          text: '本当は緊張している…',
        },
      ],
      sfx: [],
      importance: 3,
    },
  ],
}

vi.mock('@/agents/chunk-conversion', () => ({
  runChunkConversion: vi.fn(async () => ({
    result: fakeChunkConversionResult,
    provider: 'test-provider',
  })),
}))

describe('convertChunkToMangaScript speaker resolution', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it('replaces dialogue speaker ids with character names', async () => {
    const { convertChunkToMangaScript } = await import('@/agents/script/script-converter')

    const result = await convertChunkToMangaScript({
      chunkText: '物語のテキストをかなり長く繰り返してテストする文章です。'.repeat(2),
      chunkIndex: 1,
      chunksNumber: 1,
    })

    const dialogue = result.panels?.[0]?.dialogue ?? []
    expect(dialogue[0]?.speaker).toBe('山田太郎')
    expect(dialogue[1]?.speaker).toBe('山田太郎')
  })
})
