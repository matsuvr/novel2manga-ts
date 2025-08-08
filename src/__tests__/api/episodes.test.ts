import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/jobs/[jobId]/episodes/route'
import { DatabaseService } from '@/services/database'

// モック設定
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
    getJob: vi.fn(),
    getJobWithProgress: vi.fn(),
    getEpisodesByJobId: vi.fn(),
  })),
}))

// バックグラウンド処理の副作用を避けるためにプロセッサをモック
vi.mock('@/services/job-narrative-processor', () => ({
  JobNarrativeProcessor: vi.fn().mockImplementation(() => ({
    processJob: vi.fn().mockResolvedValue(undefined),
  })),
}))

describe('/api/jobs/[jobId]/episodes', () => {
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    mockDbService = {
      createNovel: vi.fn().mockResolvedValue('test-novel-id'),
      createJob: vi.fn(),
      getJob: vi.fn(),
      getJobWithProgress: vi.fn(),
      getEpisodesByJobId: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テスト用データのクリーンアップは省略（統合テストで実施）
  })

  describe('GET /api/jobs/[jobId]/episodes', () => {
    it('存在しないジョブIDの場合は404を返す', async () => {
      // 存在しないジョブのモック設定
      mockDbService.getJobWithProgress.mockResolvedValue(null)

      const request = new NextRequest('http://localhost:3000/api/jobs/nonexistent/episodes')
      const params = { jobId: 'nonexistent' }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Job not found')
    })
  })

  describe('POST /api/jobs/[jobId]/episodes', () => {
    it('有効なリクエストでエピソード分析を開始する', async () => {
      const jobId = 'test-job-episodes'

      // 既存ジョブのモック設定
      mockDbService.getJobWithProgress.mockResolvedValue({
        id: jobId,
        novelId: 'test-novel-id',
        status: 'pending',
        currentStep: 'initialized',
        episodeCompleted: false,
        progress: {
          currentStep: 'initialized',
          processedChunks: 0,
          totalChunks: 0,
          episodes: [],
        },
      })

      const requestBody = {
        config: {
          targetCharsPerEpisode: 5000,
          minCharsPerEpisode: 3000,
          maxCharsPerEpisode: 8000,
        },
      }

      const request = new NextRequest('http://localhost:3000/api/jobs/test-job-episodes/episodes', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: jobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Episode analysis started')
      expect(data.jobId).toBe(jobId)
      expect(data.status).toBe('processing')
    })

    it('存在しないジョブIDの場合は404を返す', async () => {
      // 存在しないジョブのモック設定
      mockDbService.getJobWithProgress.mockResolvedValue(null)

      const requestBody = { config: {} }

      const request = new NextRequest('http://localhost:3000/api/jobs/nonexistent/episodes', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: 'nonexistent' }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Job not found')
    })

    it('無効なリクエストボディの場合は400を返す', async () => {
      const jobId = 'test-job-episodes-invalid'

      // 既存ジョブのモック設定
      mockDbService.getJob.mockResolvedValue({
        id: jobId,
        novelId: 'test-novel-id',
        status: 'pending',
        currentStep: 'initialized',
      })

      const invalidRequestBody = {
        config: {
          targetCharsPerEpisode: 'invalid', // 文字列は無効
        },
      }

      const request = new NextRequest(
        'http://localhost:3000/api/jobs/test-job-episodes-invalid/episodes',
        {
          method: 'POST',
          body: JSON.stringify(invalidRequestBody),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
      const params = { jobId: jobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })
  })
})
