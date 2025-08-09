import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/analyze/route'
import { DatabaseService } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

// モック設定
vi.mock('@/agents/chunk-analyzer', () => ({
  chunkAnalyzerAgent: {
    generate: vi.fn().mockResolvedValue({
      object: {
        summary: 'テストチャンクの要約',
        characters: [
          {
            name: 'テスト太郎',
            description: 'テスト用キャラクター',
            firstAppearance: 0,
          },
        ],
        scenes: [
          {
            location: 'テスト場所',
            time: '朝',
            description: 'テストシーン',
            startIndex: 0,
            endIndex: 100,
          },
        ],
        dialogues: [
          {
            speakerId: 'テスト太郎',
            text: 'こんにちは',
            emotion: 'normal',
            index: 50,
          },
        ],
        highlights: [
          {
            type: 'climax' as const,
            description: 'クライマックス',
            importance: 8,
            startIndex: 80,
            endIndex: 120,
            text: 'クライマックス部分',
          },
        ],
        situations: [
          {
            description: 'テスト状況',
            index: 10,
          },
        ],
      },
    }),
  },
}))

vi.mock('@/agents/narrative-arc-analyzer', () => ({
  analyzeNarrativeArc: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/utils/episode-utils', () => ({
  prepareNarrativeAnalysisInput: vi
    .fn()
    .mockResolvedValue({ chunks: [{ chunkIndex: 0, text: 'dummy', metadata: {} }] }),
}))

vi.mock('@/config', () => ({
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate:
      'チャンク{{chunkIndex}}の分析: {{chunkText}} 前: {{previousChunkText}} 次: {{nextChunkText}}',
  })),
}))

vi.mock('@/utils/text-splitter', () => ({
  splitTextIntoChunks: vi.fn((text: string) => [
    text.substring(0, Math.ceil(text.length / 2)),
    text.substring(Math.ceil(text.length / 2)),
  ]),
}))

vi.mock('@/utils/uuid', () => ({
  generateUUID: vi.fn(() => 'test-job-uuid'),
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn(),
    getChunkStorage: vi.fn(),
    getAnalysisStorage: vi.fn(),
  },
  saveEpisodeBoundaries: vi.fn(),
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    getNovel: vi.fn(),
    createJob: vi.fn(),
    updateJobStep: vi.fn(),
    createChunk: vi.fn(),
    markJobStepCompleted: vi.fn(),
    updateJobError: vi.fn(),
  })),
}))

describe('/api/analyze', () => {
  let testNovelId: string
  let mockDbService: any
  let mockNovelStorage: any
  let mockChunkStorage: any
  let mockAnalysisStorage: any

  beforeEach(async () => {
    vi.clearAllMocks()
    testNovelId = 'test-novel-id'

    // モックサービスのセットアップ
    mockDbService = {
      createNovel: vi.fn(),
      getNovel: vi.fn().mockResolvedValue({
        id: testNovelId,
        title: 'テスト小説',
        originalTextPath: 'test-novel.txt',
        textLength: 1000,
        language: 'ja',
      }),
      createJob: vi.fn(),
      updateJobStep: vi.fn(),
      createChunk: vi.fn(),
      markJobStepCompleted: vi.fn(),
      updateJobError: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)

    // ストレージのモック設定
    mockNovelStorage = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === `${testNovelId}.json`) {
          return {
            text: JSON.stringify({
              text: 'これはテスト用の小説のテキストです。とても長い小説です。'.repeat(20),
              metadata: { title: 'テスト小説' },
            }),
          }
        }
        return null
      }),
      put: vi.fn(),
    }

    mockChunkStorage = {
      put: vi.fn(),
    }

    mockAnalysisStorage = {
      put: vi.fn(),
    }

    vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue(mockNovelStorage)
    vi.mocked(StorageFactory.getChunkStorage).mockResolvedValue(mockChunkStorage)
    vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue(mockAnalysisStorage)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/analyze', () => {
    it('有効なnovelIdで分析を実行する', async () => {
      const requestBody = {
        novelId: testNovelId,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.id).toBe('test-job-uuid')
      expect(data.data.jobId).toBe('test-job-uuid')
      expect(data.data.chunkCount).toBe(2)
      expect(data.message).toContain('分析を完了しました')
      expect(data.metadata.timestamp).toBeDefined()
    })

    it('novelIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {}

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('リクエストボディが無効')
    })

    it('novelIdが文字列でない場合は400エラーを返す', async () => {
      const requestBody = {
        novelId: 123,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('リクエストボディが無効')
    })

    it('存在しないnovelIdの場合は404エラーを返す', async () => {
      // 存在しない小説のモック設定
      mockDbService.getNovel.mockResolvedValueOnce(null)

      const requestBody = {
        novelId: 'nonexistent-novel-id',
      }

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('がデータベースに見つかりません')
    })

    it('ストレージに小説テキストが存在しない場合は404エラーを返す', async () => {
      // ストレージにテキストがない小説のモック設定
      const novelWithoutTextId = 'novel-without-text'
      mockDbService.getNovel.mockResolvedValueOnce({
        id: novelWithoutTextId,
        title: 'テキストなし小説',
        originalTextPath: 'missing-novel.txt',
        textLength: 1000,
        language: 'ja',
      })
      mockNovelStorage.get.mockReturnValueOnce(null)

      const requestBody = {
        novelId: novelWithoutTextId,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('のテキストがストレージに見つかりません')
    })
  })
})
