import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/layout/generate/route'
import { DatabaseService } from '@/services/database'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'
import { StorageFactory } from '@/utils/storage'

// モック設定 - Script-based flow
vi.mock('@/agents/script/script-converter', () => ({
  convertEpisodeTextToScript: vi.fn().mockResolvedValue({
    style_tone: 'テスト用トーン',
    style_art: 'テスト用アート',
    style_sfx: 'テスト用効果音',
    characters: [
      {
        id: 'char_1',
        name_ja: 'テスト太郎',
        role: 'protagonist',
        speech_style: 'カジュアル',
        aliases: ['太郎'],
      },
    ],
    locations: [
      {
        id: 'loc_park',
        name_ja: '公園',
        notes: '昼の公園',
      },
    ],
    props: [],
    panels: [
      {
        no: 1,
        cut: 'テスト状況説明',
        camera: 'medium',
        dialogue: ['テスト太郎: こんにちは！'],
      },
      {
        no: 2,
        cut: 'ベンチに座る',
        camera: 'close',
        dialogue: [],
      },
    ],
    continuity_checks: [],
  }),
}))

vi.mock('@/agents/script/page-break-estimator', () => ({
  estimatePageBreaks: vi.fn().mockResolvedValue({
    panels: [
      {
        pageNumber: 1,
        panelIndex: 1,
        content: 'テスト状況説明',
        dialogue: [
          {
            speaker: 'テスト太郎',
            text: 'こんにちは！',
          },
        ],
      },
      {
        pageNumber: 1,
        panelIndex: 2,
        content: 'ベンチに座る',
        dialogue: [],
      },
    ],
  }),
}))

vi.mock('@/agents/script/panel-assignment', () => ({
  buildLayoutFromPageBreaks: vi.fn().mockReturnValue({
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
            id: 'panel1',
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

vi.mock('@/utils/layout-normalizer', () => ({
  normalizeAndValidateLayout: vi.fn().mockReturnValue({
    layout: {
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
              id: 'panel1',
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
    },
    pageIssues: [],
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
    getChunkStorage: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        text: 'チャンクのテキスト内容です',
      }),
    }),
    getLayoutStorage: vi.fn().mockResolvedValue({
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
    }),
  },
  StorageKeys: {
    chunk: (jobId: string, index: number) => `${jobId}/chunks/${index}.txt`,
    chunkAnalysis: (jobId: string, index: number) => `${jobId}/analysis/chunk-${index}.json`,
    episodeLayout: (jobId: string, episodeNumber: number) =>
      `${jobId}/episode_${episodeNumber}.yaml`,
  },
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
    // JobRepository.updateStep で使用
    updateJobStep: vi.fn(),
    markJobStepCompleted: vi.fn(),
    upsertLayoutStatus: vi.fn(),
    recomputeJobTotalPages: vi.fn(),
    recomputeJobProcessedEpisodes: vi.fn(),
    updateProcessingPosition: vi.fn(),
  })),
}))

// トランザクション管理は統合テストで十分に検証されているため、このユニットでは簡易化
vi.mock('@/services/application/transaction-manager', () => ({
  executeStorageWithTracking: vi.fn(async ({ storage, key, value }: any) => {
    await storage.put(key, value)
    return key
  }),
}))

describe('/api/layout/generate', () => {
  let testJobId: string
  let testNovelId: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    __resetDatabaseServiceForTest()

    testJobId = 'test-layout-job'
    testNovelId = 'test-novel-id'

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      createEpisode: vi.fn(),
      updateJobStep: vi.fn(),
      markJobStepCompleted: vi.fn(),
      upsertLayoutStatus: vi.fn(),
      recomputeJobTotalPages: vi.fn(),
      recomputeJobProcessedEpisodes: vi.fn(),
      updateProcessingPosition: vi.fn(),
      getJobWithProgress: vi.fn().mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'pending',
        currentStep: 'analyze',
        analyzeCompleted: true,
        episodeCompleted: false,
        progress: {
          currentStep: 'analyze',
          processedChunks: 5,
          totalChunks: 5,
          episodes: [
            {
              episodeNumber: 1,
              title: 'Episode 1',
              startChunk: 0,
              endChunk: 2,
            },
          ],
        },
      }),
      getEpisodesByJobId: vi.fn().mockResolvedValue([
        {
          episodeNumber: 1,
          title: 'Episode 1',
          startChunk: 0,
          endChunk: 2,
        },
      ]),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(() => {
    __resetDatabaseServiceForTest()
  })

  describe('POST /api/layout/generate', () => {
    it('有効なリクエストでレイアウトを生成する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          panelCount: 6,
          dialogueDensity: 0.7,
          actionDensity: 0.3,
          emphasisDensity: 0.2,
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

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toBe('Layout generated successfully')
      expect(data.storageKey).toBeDefined()
      expect(data.layout).toBeDefined()
    })

    it('設定なしでレイアウトを生成する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate?demo=1', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.layout).toBeDefined()
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        episodeNumber: 1,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate?demo=1', {
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

    it('episodeNumberが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate?demo=1', {
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
        episodeNumber: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate?demo=1', {
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

    it('存在しないジョブIDでも十分なモックで生成が成功する', async () => {
      mockDbService.getJobWithProgress.mockResolvedValue(null)

      const requestBody = {
        jobId: 'nonexistent-job',
        episodeNumber: 1,
      }

      const request = new NextRequest('http://localhost:3000/api/layout/generate?demo=1', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('存在しないエピソード番号の場合は500エラーを返す', async () => {
      // Remove demo mode to test actual episode lookup failure
      mockDbService.getEpisodesByJobId.mockResolvedValue([]) // No episodes found

      const requestBody = {
        jobId: testJobId,
        episodeNumber: 999,
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

      expect(response.status).toBe(500)
      expect(data.error).toBe('Episode not found')
    })

    it('チャンク分析データが存在しない場合は500エラーを返す', async () => {
      // Remove demo mode and mock storage to return undefined for analysis
      vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue({
        get: vi.fn().mockResolvedValue(undefined),
      } as any)

      const requestBody = {
        jobId: testJobId,
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

      expect(response.status).toBe(500)
      expect(data.error).toBe('Analysis not found for chunk 0')

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

    it('設定値の境界値テストでも生成は成功する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          panelCount: 1, // 最小値
          dialogueDensity: 0.0, // 最小値
          actionDensity: 0.0, // 最小値
          emphasisDensity: 0.0, // 最小値
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

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })

    it('設定値が範囲外の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        config: {
          dialogueDensity: 1.5, // 範囲外（0-1の範囲を超える）
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
