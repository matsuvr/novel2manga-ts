import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/layout/generate/route'
import { DatabaseService } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

// モック設定
vi.mock('@/agents/layout-generator', () => ({
  generateMangaLayout: vi.fn().mockResolvedValue({
    title: 'テストマンガ',
    author: 'テスト作者',
    created_at: '2024-01-01T00:00:00.000Z',
    episodeNumber: 1,
    episodeTitle: 'テストエピソード',
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 1,
            position: { x: 0.1, y: 0.1 },
            size: { width: 0.8, height: 0.4 },
            content: 'テスト状況説明',
            dialogues: [
              {
                id: '1',
                speakerId: 'テスト太郎',
                text: 'こんにちは',
                emotion: 'normal',
                index: 0,
              },
            ],
          },
        ],
      },
    ],
  }),
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
    getAnalysisStorage: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          characters: [{ id: '1', name: 'テスト太郎', description: 'テストキャラクター' }],
          scenes: [{ id: '1', location: 'テスト場所', description: 'テスト場面' }],
          dialogues: [{ id: '1', speakerId: 'テスト太郎', text: 'こんにちは', index: 0 }],
          highlights: [],
          situations: [],
        }),
      }),
    }),
  },
  getChunkData: vi.fn().mockResolvedValue({
    text: 'チャンクのテキスト内容です',
  }),
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
    createEpisode: vi.fn(),
    getJobWithProgress: vi.fn(),
    getEpisodesByJobId: vi.fn(),
  })),
}))

describe('/api/layout/generate', () => {
  let testJobId: string
  let testNovelId: string
  let testDir: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-layout-job'
    testNovelId = 'test-novel-id'

    // テスト用ディレクトリを作成
    testDir = path.join(process.cwd(), '.test-storage')
    await fs.mkdir(testDir, { recursive: true })

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      createEpisode: vi.fn(),
      getJobWithProgress: vi.fn(),
      getEpisodesByJobId: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)

    // ルート実装が参照する .local-storage 配下にチャンク分析ファイルを作成
    const analysisDir = path.join(process.cwd(), '.local-storage', 'chunk-analysis', testJobId)
    await fs.mkdir(analysisDir, { recursive: true })

    const analysisData = {
      summary: 'チャンク0の分析結果',
      characters: [{ name: 'テスト太郎', description: 'テストキャラクター', firstAppearance: 0 }],
      scenes: [
        { location: 'テスト場所', description: 'テストシーン', startIndex: 0, endIndex: 500 },
      ],
      dialogues: [{ speakerId: 'テスト太郎', text: 'こんにちは', emotion: 'normal', index: 100 }],
      highlights: [],
      situations: [{ description: 'テスト状況', index: 50 }],
    }

    await fs.writeFile(
      path.join(analysisDir, 'chunk_0_analysis.json'),
      JSON.stringify(analysisData, null, 2),
    )
    await fs.writeFile(
      path.join(analysisDir, 'chunk_1_analysis.json'),
      JSON.stringify(analysisData, null, 2),
    )
  })

  afterEach(async () => {
    // テストディレクトリのクリーンアップ
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (_error) {
      // エラーは無視
    }
  })

  describe('POST /api/layout/generate', () => {
    it('有効なリクエストでレイアウトを生成する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          panelsPerPage: {
            min: 3,
            max: 6,
            average: 4,
          },
          dialogueDensity: 0.7,
          visualComplexity: 0.5,
          highlightPanelSizeMultiplier: 1.5,
        },
      }

      // 正常系: 既存ジョブとエピソードをモック
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([
        {
          id: `${testJobId}-ep1`,
          novelId: testNovelId,
          jobId: testJobId,
          episodeNumber: 1,
          title: 'Ep1',
          summary: 'sum',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 100,
          estimatedPages: 2,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Layout generated successfully')
      expect(data.jobId).toBe(testJobId)
      expect(data.episodeNumber).toBe(1)
      expect(data.layoutPath).toBeDefined()
      expect(data.layout).toBeDefined()
      expect(data.layout.title).toBe('テストマンガ')
      expect(data.layout.pages).toHaveLength(1)
    })

    it('設定なしでレイアウトを生成する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
      }

      // 正常系（設定なし）モック
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([
        {
          id: `${testJobId}-ep1`,
          novelId: testNovelId,
          jobId: testJobId,
          episodeNumber: 1,
          title: 'Ep1',
          summary: 'sum',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 100,
          estimatedPages: 2,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Layout generated successfully')
      expect(data.layout).toBeDefined()
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        episodeNumber: 1,
      }

      // ジョブなし
      mockDbService.getJobWithProgress.mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
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

    it('episodeNumberが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
      }

      // エピソードなし
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
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
    })

    it('episodeNumberが正の整数でない場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 0, // 正の整数でない
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
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
    })

    it('存在しないジョブIDの場合は404エラーを返す', async () => {
      const requestBody = {
        jobId: 'nonexistent-job',
        episodeNumber: 1,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Job not found')
    })

    it('存在しないエピソード番号の場合は404エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 999, // 存在しないエピソード
      }

      // ジョブは存在、エピソードは存在しない状況をモック
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([
        {
          id: `${testJobId}-ep1`,
          novelId: testNovelId,
          jobId: testJobId,
          episodeNumber: 1,
          title: 'Ep1',
          summary: 'sum',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 100,
          estimatedPages: 2,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Episode not found')
    })

    it('チャンク分析データが存在しない場合は400エラーを返す', async () => {
      // この特定のテストだけでgetAnalysisStorageのモックを変更
      const mockStorage = {
        get: vi.fn().mockResolvedValue(null), // No data found for all chunks
      }
      vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue(mockStorage as any)
      
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
      }

      // 正常なジョブ・エピソードはあるが分析データが読み込めない
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([
        {
          id: `${testJobId}-ep1`,
          novelId: testNovelId,
          jobId: testJobId,
          episodeNumber: 1,
          title: 'Ep1',
          summary: 'sum',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 100,
          estimatedPages: 2,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('No chunk analysis data found for this episode')
      
      // Reset the mock back to the original for subsequent tests
      vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue({
        get: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            characters: [{ id: '1', name: 'テスト太郎', description: 'テストキャラクター' }],
            scenes: [{ id: '1', location: 'テスト場所', description: 'テスト場面' }],
            dialogues: [{ id: '1', speakerId: 'テスト太郎', text: 'こんにちは', index: 0 }],
            highlights: [],
            situations: [],
          }),
        }),
      } as any)
    })

    it('設定値の境界値テスト', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          dialogueDensity: 1.0, // 最大値
          visualComplexity: 0.0, // 最小値
          highlightPanelSizeMultiplier: 3.0, // 最大値
        },
      }

      // 正常なジョブ・エピソードのモック
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: testJobId,
        jobName: 'AuthorX',
        status: 'processing',
        currentStep: 'layout',
        splitCompleted: true,
        analyzeCompleted: true,
        episodeCompleted: true,
        layoutCompleted: false,
        renderCompleted: false,
        totalChunks: 2,
        processedChunks: 0,
        totalEpisodes: 1,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        completedAt: null,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        resumeDataPath: null,
        progress: { currentStep: 'layout', processedChunks: 0, totalChunks: 2, episodes: [] },
      })
      mockDbService.getEpisodesByJobId.mockResolvedValue([
        {
          id: `${testJobId}-ep1`,
          novelId: testNovelId,
          jobId: testJobId,
          episodeNumber: 1,
          title: 'Ep1',
          summary: 'sum',
          startChunk: 0,
          startCharIndex: 0,
          endChunk: 1,
          endCharIndex: 100,
          estimatedPages: 2,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ])

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.layout).toBeDefined()
    })

    it('設定値が範囲外の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          dialogueDensity: 1.5, // 範囲外（0-1）
        },
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate', {
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
    })
  })
})
