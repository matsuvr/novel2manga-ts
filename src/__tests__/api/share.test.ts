import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/share/route'

// ストレージとデータベースのモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

// New unified DB mock (override per test via mockDb)
let mockDb: any
vi.mock('@/services/database/index', () => ({
  db: {
    jobs: () => ({
      getJob: (...args: any[]) => mockDb.jobs.getJob(...(args as any)),
    }),
    episodes: () => ({
      getEpisodesByJobId: (...args: any[]) => mockDb.episodes.getEpisodesByJobId(...(args as any)),
    }),
  },
}))

// UUIDモック
vi.mock('node:crypto', () => ({
  default: {
    randomUUID: vi.fn(() => 'test-share-token-uuid'),
  },
  randomUUID: vi.fn(() => 'test-share-token-uuid'),
}))

describe('/api/share', () => {
  let testJobId: string
  let testNovelId: string
  let mockDbService: any

  // ヘルパー関数: リクエストを作成してレスポンスを取得
  const makeShareRequest = async (requestBody: Record<string, unknown>) => {
    const request = new NextRequest('http://localhost:3000/api/share', {
      method: 'POST',
      body: JSON.stringify(requestBody),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const response = await POST(request)
    const data = await response.json()

    return { response, data }
  }

  // ヘルパー関数: 成功レスポンスの共通検証
  const expectSuccessResponse = (response: Response, data: any) => {
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.shareUrl).toBeDefined()
    expect(data.token).toBe('test-share-token-uuid')
    expect(data.expiresAt).toBeDefined()
  }

  // ヘルパー関数: エラーレスポンスの共通検証
  const expectErrorResponse = (response: Response, data: any, expectedError: string) => {
    expect(response.status).toBe(400)
    expect(data.success).toBe(false)
    expect(data.error).toBe(expectedError)
  }

  // ヘルパー関数: 有効期限の検証
  const expectExpiryTime = (expiresAt: string, expectedHours: number) => {
    const expiry = new Date(expiresAt)
    const now = new Date()
    const expectedExpiry = new Date(now.getTime() + expectedHours * 60 * 60 * 1000)
    const timeDiff = Math.abs(expiry.getTime() - expectedExpiry.getTime())
    expect(timeDiff).toBeLessThan(1000) // 1秒以内の誤差は許容
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-share-job'
    testNovelId = 'test-novel-id'

    // モック DB の設定（新API）
    mockDbService = {
      jobs: {
        getJob: vi.fn().mockResolvedValue({ id: testJobId }),
      },
      episodes: {
        getEpisodesByJobId: vi
          .fn()
          .mockResolvedValue([{ episodeNumber: 1 }, { episodeNumber: 2 }, { episodeNumber: 3 }]),
      },
    }
    mockDb = mockDbService
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/share', () => {
    it('有効なリクエストで共有リンクを生成する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [1, 2],
        expiresIn: 48, // 48時間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expect(data.shareUrl).toBe('http://localhost:3000/share/test-share-token-uuid')
      expect(data.message).toBe('共有機能は未実装です')
      expectExpiryTime(data.expiresAt, 48)
    })

    it('デフォルトの有効期限（72時間）で共有リンクを生成する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 72)
    })

    it('特定のエピソードのみを共有する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [3],
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'jobIdが必要です')
    })

    it('expiresInが範囲外（小さすぎる）の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 0, // 1未満
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'expiresInは1から168（時間）の間で指定してください')
    })

    it('expiresInが範囲外（大きすぎる）の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 200, // 168（1週間）を超過
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'expiresInは1から168（時間）の間で指定してください')
    })

    it('存在しないジョブIDの場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue(null)
      const requestBody = {
        jobId: 'nonexistent-job',
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, '指定されたジョブが見つかりません')
    })

    it('最大有効期限（168時間）でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 168, // 1週間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 168)
    })

    it('最小有効期限（1時間）でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 1, // 1時間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 1)
    })

    it('空のepisodeNumbers配列でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({ id: testJobId })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [],
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
    })
  })
})
