/**
 * API契約テスト
 * 各エンドポイントの入出力契約とエラーハンドリングを検証
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as AnalyzePost } from '@/app/api/analyze/route'
import { GET as JobStatusGet } from '@/app/api/jobs/[jobId]/status/route'
import { POST as NovelPost } from '@/app/api/novel/route'
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
  },
  StorageKeys: {
    chunk: (jobId: string, index: number) => `${jobId}/chunks/${index}.txt`,
    chunkAnalysis: (jobId: string, index: number) => `${jobId}/analysis/chunk-${index}.json`,
  },
}))

describe('API Contract Tests', () => {
  let testDb: TestDatabase
  let dataFactory: TestDataFactory
  let storageDataFactory: TestStorageDataFactory

  beforeEach(async () => {
    // テストデータベースの初期化
    testDb = await createTestDatabase()
    dataFactory = new TestDataFactory(testDb.db)

    // テストストレージの初期化
    testStorageFactory = new TestStorageFactory()
    storageDataFactory = new TestStorageDataFactory(testStorageFactory)

    // DatabaseServiceのモック（実際のテストDBを使用）
    vi.doMock('@/services/database', () => ({
      DatabaseService: vi.fn(() => testDb.service),
    }))

    // db-factoryのモック
    vi.doMock('@/services/db-factory', () => ({
      __resetDatabaseServiceForTest: vi.fn(),
      getRepositoryFactory: vi.fn(() => ({
        // 必要に応じて実装
      })),
    }))

    // エージェントモックのセットアップ
    setupAgentMocks()
  })

  afterEach(async () => {
    resetAgentMocks()
    testStorageFactory.clearAll()
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

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.uuid).toMatch(/^[a-f0-9-]+$/)
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
      await storageDataFactory.seedNovelText(novelId, novelText, { title: 'Test Novel' })
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

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.jobId).toMatch(/^test-uuid-\\d+$/)
      expect(data.chunkCount).toBeGreaterThan(0)
      expect(data.message).toContain('分析を完了しました')
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
      })
      jobId = job.id

      // チャンクデータの準備
      await dataFactory.createChunk({
        jobId,
        chunkIndex: 0,
        text: 'チャンク1のテキスト',
      })
      await dataFactory.createChunk({
        jobId,
        chunkIndex: 1,
        text: 'チャンク2のテキスト',
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

      const response = await JobStatusGet(request, { params: { jobId: nonexistentJobId } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('見つかりません')
    })
  })
})