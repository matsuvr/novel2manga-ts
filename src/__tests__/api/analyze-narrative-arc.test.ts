import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/analyze/narrative-arc/route'
import { DatabaseService } from '@/services/database'

// モック設定
vi.mock('@/agents/narrative-arc-analyzer', () => ({
  analyzeNarrativeArc: vi.fn().mockResolvedValue([
    {
      episodeNumber: 1,
      title: 'テストエピソード1',
      summary: '最初のエピソードの要約',
      startChunk: 0,
      startCharIndex: 0,
      endChunk: 1,
      endCharIndex: 500,
      estimatedPages: 5,
      confidence: 0.85,
    },
    {
      episodeNumber: 2,
      title: 'テストエピソード2',
      summary: '2番目のエピソードの要約',
      startChunk: 1,
      startCharIndex: 500,
      endChunk: 2,
      endCharIndex: 1000,
      estimatedPages: 6,
      confidence: 0.9,
    },
  ]),
}))

vi.mock('@/utils/episode-utils', () => ({
  prepareNarrativeAnalysisInput: vi.fn().mockResolvedValue({
    chunks: [
      {
        chunkIndex: 0,
        text: 'チャンク0のテキスト内容です。物語の始まりの部分です。',
        metadata: {},
      },
      {
        chunkIndex: 1,
        text: 'チャンク1のテキスト内容です。物語が続きます。',
        metadata: {},
      },
      {
        chunkIndex: 2,
        text: 'チャンク2のテキスト内容です。物語の続きの部分です。',
        metadata: {},
      },
    ],
  }),
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
  saveEpisodeBoundaries: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
  })),
}))

describe('/api/analyze/narrative-arc', () => {
  let testNovelId: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    testNovelId = 'test-novel-id'

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/analyze/narrative-arc', () => {
    it('有効なリクエストでナラティブアーク分析を実行する', async () => {
      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: 0,
        targetChars: 1000,
        minChars: 500,
        maxChars: 1500,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.novelId).toBe(testNovelId)
      expect(data.analyzedChunks).toBeDefined()
      expect(data.analyzedChunks.start).toBe(0)
      expect(data.analyzedChunks.end).toBe(2)
      expect(data.analyzedChunks.count).toBe(3)
      expect(data.totalChars).toBeGreaterThan(0)
      expect(data.boundaries).toHaveLength(2)
      expect(data.boundaries[0].episodeNumber).toBe(1)
      expect(data.boundaries[0].title).toBe('テストエピソード1')
      expect(data.boundaries[1].episodeNumber).toBe(2)
      expect(data.boundaries[1].title).toBe('テストエピソード2')
    })

    it('必須のフィールドのみでリクエストを送信する', async () => {
      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.novelId).toBe(testNovelId)
      expect(data.boundaries).toHaveLength(2)
    })

    it('novelIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        startChunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('startChunkIndexが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        novelId: testNovelId,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('startChunkIndexが負の値の場合は400エラーを返す', async () => {
      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: -1,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })

    it('準備関数が失敗した場合は400エラーを返す', async () => {
      // prepareNarrativeAnalysisInputがnullを返すようにモック
      const { prepareNarrativeAnalysisInput } = await import('@/utils/episode-utils')
      vi.mocked(prepareNarrativeAnalysisInput).mockResolvedValueOnce(null)

      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Failed to prepare narrative analysis input')
      expect(data.details).toBe('Not enough chunks available or invalid chunk range')
    })

    it('分析関数がエラーを投げた場合は500エラーを返す', async () => {
      // analyzeNarrativeArcがエラーを投げるようにモック
      const { analyzeNarrativeArc } = await import('@/agents/narrative-arc-analyzer')
      vi.mocked(analyzeNarrativeArc).mockRejectedValueOnce(
        new Error('分析処理でエラーが発生しました'),
      )

      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to analyze narrative arc')
      expect(data.details).toBe('分析処理でエラーが発生しました')
    })

    it('境界が見つからない場合は提案を含むレスポンスを返す', async () => {
      // analyzeNarrativeArcが空配列を返すようにモック
      const { analyzeNarrativeArc } = await import('@/agents/narrative-arc-analyzer')
      vi.mocked(analyzeNarrativeArc).mockResolvedValueOnce([])

      const requestBody = {
        novelId: testNovelId,
        startChunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/narrative-arc', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.boundaries).toHaveLength(0)
      expect(data.suggestions).toBeDefined()
      expect(data.suggestions).toContain('No natural episode breaks found in this range')
    })
  })
})
