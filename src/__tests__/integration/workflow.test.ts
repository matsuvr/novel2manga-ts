/**
 * ワークフロー統合テスト
 * エンドツーエンドの業務フローをテスト（サーバー起動不要）
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as AnalyzePost } from '@/app/api/analyze/route'
import { GET as EpisodesGet } from '@/app/api/jobs/[jobId]/episodes/route'
import { GET as JobStatusGet } from '@/app/api/jobs/[jobId]/status/route'
import { POST as NovelPost } from '@/app/api/novel/route'
import { resetAgentMocks, setupAgentMocks } from './__helpers/test-agents'
import type { TestDatabase } from './__helpers/test-database'
import { cleanupTestDatabase, createTestDatabase, TestDataFactory } from './__helpers/test-database'
import { TestStorageDataFactory, TestStorageFactory } from './__helpers/test-storage'

// テスト用設定とモックの設定
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
  saveEpisodeBoundaries: vi.fn(),
}))

describe('Workflow Integration Tests', () => {
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

    // DatabaseServiceのモック
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

  describe('Novel Upload to Episode Generation Workflow', () => {
    it('小説アップロードから完全な分析・エピソード生成まで', async () => {
      const novelText = '昔々、ある所に勇敢な騎士が住んでいました。彼の名前はアーサーといいました。'.repeat(200)

      // Step 1: 小説をアップロード
      const uploadRequest = new NextRequest('http://localhost:3000/api/novel', {
        method: 'POST',
        body: JSON.stringify({ text: novelText }),
        headers: { 'Content-Type': 'application/json' },
      })

      const uploadResponse = await NovelPost(uploadRequest)
      const uploadData = await uploadResponse.json()

      expect(uploadResponse.status).toBe(201)
      expect(uploadData.success).toBe(true)
      expect(uploadData.uuid).toBeDefined()

      const novelId = uploadData.uuid

      // Step 2: 小説の分析を実行
      const analyzeRequest = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ novelId }),
        headers: { 'Content-Type': 'application/json' },
      })

      const analyzeResponse = await AnalyzePost(analyzeRequest)
      const analyzeData = await analyzeResponse.json()

      expect(analyzeResponse.status).toBe(201)
      expect(analyzeData.success).toBe(true)
      expect(analyzeData.jobId).toBeDefined()
      expect(analyzeData.chunkCount).toBeGreaterThan(0)

      const jobId = analyzeData.jobId

      // Step 3: ジョブステータスの確認
      const statusRequest = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`, {
        method: 'GET',
      })

      const statusResponse = await JobStatusGet(statusRequest, { params: { jobId } })
      const statusData = await statusResponse.json()

      expect(statusResponse.status).toBe(200)
      expect(statusData.success).toBe(true)
      expect(statusData.job).toBeDefined()
      expect(statusData.job.status).toBe('completed')
      expect(statusData.chunks).toHaveLength(analyzeData.chunkCount)

      // Step 4: エピソード情報の取得（完全分析では生成される）
      const episodesRequest = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/episodes`, {
        method: 'GET',
      })

      const episodesResponse = await EpisodesGet(episodesRequest, { params: { jobId } })
      const episodesData = await episodesResponse.json()

      expect(episodesResponse.status).toBe(200)
      expect(episodesData.success).toBe(true)
      expect(episodesData.episodes).toBeDefined()
      expect(Array.isArray(episodesData.episodes)).toBe(true)

      // Step 5: データの整合性確認
      const storedJob = await testDb.service.getJob(jobId)
      expect(storedJob).toBeDefined()
      expect(storedJob?.novelId).toBe(novelId)
      expect(storedJob?.status).toBe('completed')

      const chunks = await testDb.service.getChunks(jobId)
      expect(chunks).toHaveLength(analyzeData.chunkCount)

      // ストレージの確認
      const novelStorage = await testStorageFactory.getNovelStorage()
      expect(novelStorage.has(`${novelId}.json`)).toBe(true)

      const chunkStorage = await testStorageFactory.getChunkStorage()
      expect(chunkStorage.has(`${jobId}/chunks/0.txt`)).toBe(true)

      const analysisStorage = await testStorageFactory.getAnalysisStorage()
      expect(analysisStorage.has(`${jobId}/analysis/chunk-0.json`)).toBe(true)
    })

    it('splitOnlyモードでの限定的なワークフロー', async () => {
      const novelText = 'これはsplitOnlyモードのテスト用テキストです。'.repeat(100)

      // Step 1: 小説をアップロード
      const uploadRequest = new NextRequest('http://localhost:3000/api/novel', {
        method: 'POST',
        body: JSON.stringify({ text: novelText }),
        headers: { 'Content-Type': 'application/json' },
      })

      const uploadResponse = await NovelPost(uploadRequest)
      const uploadData = await uploadResponse.json()
      const novelId = uploadData.uuid

      // Step 2: splitOnlyで分析を実行
      const analyzeRequest = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ novelId, splitOnly: true }),
        headers: { 'Content-Type': 'application/json' },
      })

      const analyzeResponse = await AnalyzePost(analyzeRequest)
      const analyzeData = await analyzeResponse.json()
      const jobId = analyzeData.jobId

      expect(analyzeResponse.status).toBe(201)
      expect(analyzeData.success).toBe(true)

      // Step 3: ジョブステータスの確認（split完了状態）
      const statusRequest = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`, {
        method: 'GET',
      })

      const statusResponse = await JobStatusGet(statusRequest, { params: { jobId } })
      const statusData = await statusResponse.json()

      expect(statusResponse.status).toBe(200)
      expect(statusData.job.status).toBe('completed')
      expect(statusData.job.currentStep).toBe('split_complete')
      expect(statusData.chunks).toHaveLength(analyzeData.chunkCount)

      // Step 4: エピソード情報の取得（splitOnlyでは作成されない or デモエピソード）
      const episodesRequest = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/episodes`, {
        method: 'GET',
      })

      const episodesResponse = await EpisodesGet(episodesRequest, { params: { jobId } })

      // splitOnlyの場合の動作は実装に依存（404 or デモエピソード）
      if (episodesResponse.status === 200) {
        const episodesData = await episodesResponse.json()
        expect(episodesData.success).toBe(true)
        expect(episodesData.episodes).toBeDefined()
        // デモエピソードの場合
        expect(episodesData.episodes[0]?.title).toContain('デモ')
      } else {
        expect(episodesResponse.status).toBe(404)
      }

      // 分析結果がストレージに保存されていないことを確認
      const analysisStorage = await testStorageFactory.getAnalysisStorage()
      expect(analysisStorage.has(`${jobId}/analysis/chunk-0.json`)).toBe(false)
    })
  })

  describe('Error Handling Workflows', () => {
    it('存在しない小説IDでの分析エラーハンドリング', async () => {
      const analyzeRequest = new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ novelId: 'nonexistent-novel-id' }),
        headers: { 'Content-Type': 'application/json' },
      })

      const analyzeResponse = await AnalyzePost(analyzeRequest)
      expect(analyzeResponse.status).toBe(404)

      const analyzeData = await analyzeResponse.json()
      expect(analyzeData.success).toBe(false)
      expect(analyzeData.error).toContain('見つかりません')
    })

    it('存在しないジョブIDでのステータス確認エラーハンドリング', async () => {
      const statusRequest = new NextRequest('http://localhost:3000/api/jobs/nonexistent-job/status', {
        method: 'GET',
      })

      const statusResponse = await JobStatusGet(statusRequest, { params: { jobId: 'nonexistent-job' } })
      expect(statusResponse.status).toBe(404)

      const statusData = await statusResponse.json()
      expect(statusData.success).toBe(false)
      expect(statusData.error).toContain('見つかりません')
    })
  })

  describe('Concurrent Workflow Tests', () => {
    it('複数の小説を並行処理できる', async () => {
      const novels = [
        'これは第一の小説です。'.repeat(50),
        'これは第二の小説です。'.repeat(60),
        'これは第三の小説です。'.repeat(40),
      ]

      // 並行で小説をアップロード
      const uploadPromises = novels.map(async (text, index) => {
        const request = new NextRequest('http://localhost:3000/api/novel', {
          method: 'POST',
          body: JSON.stringify({ text }),
          headers: { 'Content-Type': 'application/json' },
        })

        const response = await NovelPost(request)
        const data = await response.json()
        return { novelId: data.uuid, index }
      })

      const uploadResults = await Promise.all(uploadPromises)

      // 並行で分析を実行
      const analyzePromises = uploadResults.map(async ({ novelId, index }) => {
        const request = new NextRequest('http://localhost:3000/api/analyze', {
          method: 'POST',
          body: JSON.stringify({ novelId, splitOnly: true }),
          headers: { 'Content-Type': 'application/json' },
        })

        const response = await AnalyzePost(request)
        const data = await response.json()
        return { jobId: data.jobId, novelId, index }
      })

      const analyzeResults = await Promise.all(analyzePromises)

      // 全ての処理が成功していることを確認
      expect(analyzeResults).toHaveLength(3)
      analyzeResults.forEach((result) => {
        expect(result.jobId).toBeDefined()
        expect(result.novelId).toBeDefined()
      })

      // データベースの状態確認
      for (const result of analyzeResults) {
        const job = await testDb.service.getJob(result.jobId)
        expect(job).toBeDefined()
        expect(job?.status).toBe('completed')
        expect(job?.novelId).toBe(result.novelId)
      }
    })
  })
})