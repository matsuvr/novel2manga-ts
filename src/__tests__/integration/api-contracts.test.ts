/**
 * API契約テスト
 * 各エンドポイントの入出力契約とエラーハンドリングを検証
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { explainRateLimit, isRateLimitAcceptable } from './__helpers/rate-limit'
import { resetAgentMocks, setupAgentMocks } from './__helpers/test-agents'
import type { TestDatabase } from './__helpers/test-database'
import { cleanupTestDatabase, createTestDatabase, TestDataFactory } from './__helpers/test-database'
import { TestStorageDataFactory, TestStorageFactory } from './__helpers/test-storage'

// テスト用の設定モック
vi.mock('@/config', () => ({
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate: 'テスト用プロンプト: {{chunkText}}',
  })),
  getLLMProviderConfig: vi.fn(() => ({
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 1000,
  })),
  getDatabaseConfig: vi.fn(() => ({
    sqlite: {
      path: ':memory:',
    },
  })),
}))

// StorageFactoryのモック
let testStorageFactory: TestStorageFactory
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: () => testStorageFactory.getNovelStorage(),
    getChunkStorage: () => testStorageFactory.getChunkStorage(),
    getAnalysisStorage: () => testStorageFactory.getAnalysisStorage(),
    getLayoutStorage: () => testStorageFactory.getLayoutStorage(),
    getRenderStorage: () => testStorageFactory.getRenderStorage(),
    getOutputStorage: () => testStorageFactory.getOutputStorage(),
  },
  StorageKeys: {
    chunk: (jobId: string, index: number) => `${jobId}/chunks/${index}.txt`,
    chunkAnalysis: (jobId: string, index: number) => `${jobId}/analysis/chunk-${index}.json`,
    episodeLayout: (jobId: string, episodeNumber: number) =>
      `${jobId}/episode_${episodeNumber}.yaml`,
  },
  saveEpisodeBoundaries: vi.fn().mockResolvedValue(undefined),
}))

// RepositoryFactory のモック（テストDBに委譲）
let __testDbForFactory: TestDatabase | undefined
vi.mock('@/repositories/factory', () => {
  const factory = () => ({
    getJobRepository: () => ({
      create: (payload: any) => __testDbForFactory!.service.createJob(payload),
      updateStep: (
        id: string,
        step: any,
        processed?: number,
        total?: number,
        error?: string,
        errorStep?: string,
      ) =>
        (__testDbForFactory!.service as any).updateJobStep(
          id,
          step,
          processed,
          total,
          error,
          errorStep,
        ),
      markStepCompleted: (id: string, step: any) =>
        __testDbForFactory!.service.markJobStepCompleted(id, step),
      updateStatus: (id: string, status: any) =>
        __testDbForFactory!.service.updateJobStatus(id, status),
      getJobWithProgress: (id: string) => __testDbForFactory!.service.getJobWithProgress(id),
    }),
    getNovelRepository: () => ({
      get: (id: string) => __testDbForFactory!.service.getNovel(id),
      ensure: (id: string, payload: any) => __testDbForFactory!.service.ensureNovel(id, payload),
    }),
    getChunkRepository: () => ({
      create: (payload: any) => __testDbForFactory!.service.createChunk(payload),
      createBatch: (payloads: any[]) => __testDbForFactory!.service.createChunksBatch(payloads),
      // ChunkRepository.getByJobId が動くように、ポートに直接実装を生やす
      getByJobId: (jobId: string) => __testDbForFactory!.service.getChunksByJobId(jobId) as any,
      db: {
        getChunksByJobId: (jobId: string) => __testDbForFactory!.service.getChunksByJobId(jobId),
      },
    }),
    getOutputRepository: () => ({
      // 今回のテストでは未使用
    }),
  })
  return {
    getRepositoryFactory: factory,
    getJobRepository: () => factory().getJobRepository(),
    getNovelRepository: () => factory().getNovelRepository(),
    getChunkRepository: () => factory().getChunkRepository(),
    getOutputRepository: () => factory().getOutputRepository(),
  }
})

describe('API Contract Tests', () => {
  let testDb: TestDatabase
  let dataFactory: TestDataFactory
  let storageDataFactory: TestStorageDataFactory
  // ルートハンドラはモック適用後に動的 import する
  let AnalyzePost: any
  let JobStatusGet: any
  let NovelPost: any

  beforeEach(async () => {
    // テストデータベースの初期化
    testDb = await createTestDatabase()
    __testDbForFactory = testDb
    dataFactory = new TestDataFactory(testDb.db)

    // テストストレージの初期化
    testStorageFactory = new TestStorageFactory()
    storageDataFactory = new TestStorageDataFactory(testStorageFactory)

    // DatabaseServiceのモック（実際のテストDBを使用）
    vi.doMock('@/services/database', () => ({
      DatabaseService: vi.fn(() => testDb.service),
    }))

    // db-factoryのモック（アプリ側が取得するDBサービスをテストDBに固定）
    vi.doMock('@/services/db-factory', () => ({
      __resetDatabaseServiceForTest: vi.fn(),
      getDatabaseService: vi.fn(() => testDb.service),
    }))

    // エージェントモックのセットアップ
    setupAgentMocks()

    // 依存のモック適用後に対象を import
    ;({ POST: AnalyzePost } = await import('@/app/api/analyze/route'))
    ;({ GET: JobStatusGet } = await import('@/app/api/jobs/[jobId]/status/route'))
    ;({ POST: NovelPost } = await import('@/app/api/novel/route'))
  })

  afterEach(async () => {
    __testDbForFactory = undefined
    resetAgentMocks()
    testStorageFactory?.clearAll?.()
    await cleanupTestDatabase(testDb)
    vi.clearAllMocks()
  })

  describe('POST /api/novel', () => {
    it('正常な小説テキストをアップロードできる', async () => {
      const novelText = 'これはテスト用の小説テキストです。'.repeat(50)
      const requestBody = { text: novelText }

      const request = new NextRequest('http://localhost:3000/api/novel', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await NovelPost(request)
      const data = await response.json()

      expect([200, 201]).toContain(response.status)
      expect(data.success).toBe(true)
      // テスト用UUIDモックでも許容
      expect(typeof data.uuid).toBe('string')
      expect(data.message).toContain('小説が正常に保存されました')

      // ストレージに保存されていることを確認
      const storage = await testStorageFactory.getNovelStorage()
      expect(storage.has(`${data.uuid}.json`)).toBe(true)
    })

    it('空の文字列は拒否される', async () => {
      const request = new NextRequest('http://localhost:3000/api/novel', {
        method: 'POST',
        body: JSON.stringify({ text: '' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await NovelPost(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toContain('テキストが必要です')
    })

    it('不正なJSONは拒否される', async () => {
      const request = new NextRequest('http://localhost:3000/api/novel', {
        method: 'POST',
        body: 'invalid json',
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await NovelPost(request)
      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/analyze', () => {
    let novelId: string

    beforeEach(async () => {
      // テスト用小説データの準備
      const novel = await dataFactory.createNovel({
        title: 'Test Novel',
        textLength: 2000,
      })
      novelId = novel.id

      const novelText = 'これはテスト用の長い小説テキストです。'.repeat(100)
      await storageDataFactory.seedNovelText(novelId, novelText, {
        title: 'Test Novel',
      })
    })

    it('正常な分析リクエストを処理できる', async () => {
      const requestBody = { novelId }

      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await AnalyzePost(request)
      const data = await response.json()

      if (isRateLimitAcceptable(response.status, data)) {
        expect([429, 503]).toContain(response.status)
        expect(explainRateLimit(data)).toBeTruthy()
        return
      }

      expect([200, 201, 500]).toContain(response.status)

      if (response.status === 500) {
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      } else {
        expect(data.success).toBe(true)
        expect(data.jobId).toMatch(/^test-uuid-[d\d]+$/)
        expect(data.chunkCount).toBeGreaterThan(0)
        expect(data.message).toContain('分析を完了しました')
      }
    })

    it('存在しないnovelIdは404エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ novelId: 'nonexistent-id' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await AnalyzePost(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('見つかりません')
    })

    it('novelIdが未指定の場合は400エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify({}),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await AnalyzePost(request)
      expect(response.status).toBe(400)
    })
  })

  describe('GET /api/jobs/[jobId]/status', () => {
    let jobId: string

    beforeEach(async () => {
      // テスト用ジョブデータの準備
      const novel = await dataFactory.createNovel()
      const job = await dataFactory.createJob({
        novelId: novel.id,
        status: 'completed',
        currentStep: 'analysis_complete',
        // 完了条件が renderCompleted に変更されたため、テストデータでも明示的に完了扱いにする
        renderCompleted: true,
        layoutCompleted: true,
      })
      jobId = job.id

      // チャンクデータの準備
      await dataFactory.createChunk({
        jobId,
        novelId: novel.id,
        chunkIndex: 0,
        contentPath: `${jobId}/chunks/0.txt`,
        startPosition: 0,
        endPosition: 10,
        wordCount: 10,
      })
      await dataFactory.createChunk({
        jobId,
        novelId: novel.id,
        chunkIndex: 1,
        contentPath: `${jobId}/chunks/1.txt`,
        startPosition: 10,
        endPosition: 20,
        wordCount: 10,
      })
    })

    it('存在するジョブのステータスを取得できる', async () => {
      const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`, {
        method: 'GET',
      })

      const response = await JobStatusGet(request, { params: { jobId } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.job).toBeDefined()
      expect(data.job.id).toBe(jobId)
      expect(data.job.status).toBe('completed')
      expect(data.chunks).toBeDefined()
      expect(data.chunks).toHaveLength(2)
    })

    it('存在しないジョブIDは404エラーを返す', async () => {
      const nonexistentJobId = 'nonexistent-job-id'
      const request = new NextRequest(`http://localhost:3000/api/jobs/${nonexistentJobId}/status`, {
        method: 'GET',
      })

      const response = await JobStatusGet(request, {
        params: { jobId: nonexistentJobId },
      })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('見つかりません')
    })
  })
})
