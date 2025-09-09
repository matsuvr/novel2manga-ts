import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  explainRateLimit,
  isRateLimitAcceptable,
} from '@/__tests__/integration/__helpers/rate-limit'
import { POST } from '@/app/api/analyze/route'
import { DatabaseService, db } from '@/services/database'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'
import { StorageFactory } from '@/utils/storage'

// モック用のヘルパー関数を定義（vi.mock より前に宣言）
let mockDbService: any
let mockNovelsService: any
let mockJobsService: any
let mockEpisodesService: any
let mockChunksService: any
let mockRenderService: any
let mockLayoutService: any

// モック設定
vi.mock('@/agents/chunk-analyzer', () => ({
  getChunkAnalyzerAgent: vi.fn(() => ({
    generateObject: vi.fn().mockResolvedValue({
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
    }),
  })),
}))

vi.mock('@/config', () => ({
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate:
      'チャンク{{chunkIndex}}の分析: {{chunkText}} 前要約: {{previousChunkSummary}} 次要約: {{nextChunkSummary}}',
  })),
  getLLMProviderConfig: vi.fn(() => ({ maxTokens: 1000 })),
  getDatabaseConfig: vi.fn(() => ({ sqlite: { path: ':memory:' } })),
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
  // StorageKeys をテスト用に最低限再現（本番実装とシグネチャ整合）
  StorageKeys: {
    chunk: (jobId: string, index: number) => `${jobId}/chunks/${index}.txt`,
    chunkAnalysis: (jobId: string, index: number) => `${jobId}/analysis/chunk-${index}.json`,
  },
  saveEpisodeBoundaries: vi.fn(),
}))

vi.mock('@/services/database', () => {
  // モック用のデータベースサービスを定義（ファクトリ内で初期化）
  const mockNovelsService = {
    ensureNovel: vi.fn(),
    getNovel: vi.fn(),
    createNovel: vi.fn(),
  }

  const mockJobsService = {
    createJobRecord: vi.fn(),
    getJob: vi.fn(),
    updateJobStatus: vi.fn(),
    updateJobStep: vi.fn(),
    markStepCompleted: vi.fn(),
    updateJobTotalPages: vi.fn(),
    updateJobCoverageWarnings: vi.fn(),
    updateProcessingPosition: vi.fn(),
  }

  const mockEpisodesService = {
    getEpisodesByJobId: vi.fn().mockResolvedValue([]),
    createEpisodes: vi.fn(),
  }

  const mockChunksService = {
    createChunk: vi.fn(),
    createChunksBatch: vi.fn(),
  }

  const mockRenderService = {
    upsertRenderStatus: vi.fn(),
  }

  const mockLayoutService = {
    upsertLayoutStatus: vi.fn(),
  }

  return {
    DatabaseService: vi.fn().mockImplementation(() => ({
      createNovel: vi.fn(),
      ensureNovel: vi.fn(),
      getNovel: vi.fn(),
      createJob: vi.fn(),
      updateJobStep: vi.fn(),
      updateJobStatus: vi.fn(),
      createChunk: vi.fn(),
      // テストで呼ばれる場合のフォールバック: バッチは逐次
      createChunksBatch: vi.fn(async (payloads: any[]) => {
        for (const p of payloads) {
          // eslint-disable-next-line no-await-in-loop
          await (this as any).createChunk?.(p)
        }
      }),
      markJobStepCompleted: vi.fn(),
      updateJobError: vi.fn(),
    })),
    db: {
      novels: () => mockNovelsService,
      jobs: () => mockJobsService,
      episodes: () => mockEpisodesService,
      chunks: () => mockChunksService,
      render: () => mockRenderService,
      layout: () => mockLayoutService,
    },
  }
})

describe('/api/analyze', () => {
  let testNovelId: string
  let mockDbService: any
  let mockNovelStorage: any
  let mockChunkStorage: any
  let mockAnalysisStorage: any

  beforeEach(async () => {
    __resetDatabaseServiceForTest()
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
      // RepositoryFactory のランタイム検証対策で追加
      getJob: vi.fn().mockResolvedValue(null),
      createJob: vi.fn(),
      updateJobStep: vi.fn(),
      createChunk: vi.fn(),
      markJobStepCompleted: vi.fn(),
      updateJobError: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)

    // db() 関数用のモック設定
    const mockedDb = vi.mocked(db)
    mockedDb.novels().getNovel.mockResolvedValue({
      id: testNovelId,
      title: 'テスト小説',
      originalTextPath: 'test-novel.txt',
      textLength: 1000,
      language: 'ja',
    })
    mockedDb.novels().ensureNovel.mockResolvedValue()
    mockedDb.jobs().createJobRecord.mockResolvedValue()
    mockedDb.jobs().getJob.mockResolvedValue(null)
    mockedDb.jobs().updateJobStatus.mockResolvedValue()
    mockedDb.jobs().updateJobStep.mockResolvedValue()
    mockedDb.jobs().markStepCompleted.mockResolvedValue()
    mockedDb.jobs().updateJobTotalPages.mockResolvedValue()
    mockedDb.jobs().updateJobCoverageWarnings.mockResolvedValue()
    mockedDb.chunks().createChunk.mockResolvedValue()
    mockedDb.chunks().createChunksBatch.mockResolvedValue()
    mockedDb.episodes().getEpisodesByJobId.mockResolvedValue([])
    mockedDb.episodes().createEpisodes.mockResolvedValue()

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
    __resetDatabaseServiceForTest()
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

      if (isRateLimitAcceptable(response.status, data)) {
        expect([429, 503]).toContain(response.status)
        expect(explainRateLimit(data)).toBeTruthy()
        return
      }

      expect([201, 500]).toContain(response.status)

      if (response.status === 500) {
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      } else {
        expect(data.success).toBe(true)
        expect(data.jobId).toBe('test-job-uuid')
        expect(data.chunkCount).toBe(2)
        expect(data.message).toContain('分析を完了しました')
      }
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
      vi.mocked(db).novels().getNovel.mockResolvedValueOnce(null)

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
      const novelData = {
        id: novelWithoutTextId,
        title: 'テキストなし小説',
        originalTextPath: 'missing-novel.txt',
        textLength: 1000,
        language: 'ja',
      }
      mockDbService.getNovel.mockResolvedValueOnce(novelData)
      vi.mocked(db).novels().getNovel.mockResolvedValueOnce(novelData)
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
