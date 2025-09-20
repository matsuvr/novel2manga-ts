import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE as DELETE_SHARE_STATUS, GET as GET_SHARE_STATUS } from '@/app/api/share/[jobId]/route'
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
    share: () => ({
      enableShare: (...args: any[]) => mockDb.share.enableShare(...(args as any)),
      getShareByJobId: (...args: any[]) => mockDb.share.getShareByJobId(...(args as any)),
      getShareByToken: (...args: any[]) => mockDb.share.getShareByToken(...(args as any)),
      disableShare: (...args: any[]) => mockDb.share.disableShare(...(args as any)),
      touchAccess: (...args: any[]) => mockDb.share.touchAccess(...(args as any)),
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
  // テスト安定化用の固定現在時刻
  let fixedNow: Date

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

  const callShareStatus = async (method: 'GET' | 'DELETE', jobId: string) => {
    const request = new NextRequest(`http://localhost:3000/api/share/${jobId}`, { method })
    if (method === 'GET') {
      const response = await GET_SHARE_STATUS(request, { params: { jobId } })
      const data = await response.json()
      return { response, data }
    }
    const response = await DELETE_SHARE_STATUS(request, { params: { jobId } })
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
    expect(data.message).toBe('共有リンクを作成しました')
    expect(data.share).toMatchObject({ enabled: true, shareUrl: data.shareUrl })
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
    // 固定した基準時刻を用いて期待有効期限を計算
    const expectedExpiry = new Date(fixedNow.getTime() + expectedHours * 60 * 60 * 1000)
    const timeDiff = Math.abs(expiry.getTime() - expectedExpiry.getTime())
    // fake timers により処理遅延の影響を排除し 1秒以内に安定させる
    expect(timeDiff).toBeLessThan(1000)
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    // 固定時刻を設定 (任意の決め打ちUTC日時)
    fixedNow = new Date('2025-01-01T00:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(fixedNow)

    testJobId = 'test-share-job'
    testNovelId = 'test-novel-id'

    // モック DB の設定（新API）
    mockDbService = {
      jobs: {
        getJob: vi
          .fn()
          .mockResolvedValue({
            id: testJobId,
            novelId: testNovelId,
            status: 'completed',
            userId: 'test-user-bypass',
          }),
      },
      episodes: {
        getEpisodesByJobId: vi
          .fn()
          .mockResolvedValue([{ episodeNumber: 1 }, { episodeNumber: 2 }, { episodeNumber: 3 }]),
      },
      share: {
        enableShare: vi.fn().mockImplementation(async (args: any) => ({
          id: 'share-record-id',
          jobId: args.jobId,
          token: args.token,
          expiresAt: args.expiresAt,
          isEnabled: true,
          episodeNumbers: args.episodeNumbers ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          disabledAt: null,
          lastAccessedAt: null,
        })),
        getShareByJobId: vi.fn().mockResolvedValue(null),
        getShareByToken: vi.fn().mockResolvedValue(null),
        disableShare: vi.fn().mockResolvedValue(undefined),
        touchAccess: vi.fn().mockResolvedValue(undefined),
      },
    }
    mockDb = mockDbService
  })

  afterEach(async () => {
    vi.useRealTimers()
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/share', () => {
    it('有効なリクエストで共有リンクを生成する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [1, 2],
        expiresIn: 48, // 48時間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expect(data.shareUrl).toBe('http://localhost:3000/share/test-share-token-uuid')
      expectExpiryTime(data.expiresAt, 48)
    })

    it('デフォルトの有効期限（72時間）で共有リンクを生成する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 72)
    })

    it('特定のエピソードのみを共有する', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [3],
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'jobIdが必要です')
    })

    it('expiresInが範囲外（小さすぎる）の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 0, // 1未満
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'expiresInは1から168（時間）の間で指定してください')
    })

    it('expiresInが範囲外（大きすぎる）の場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
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

    it('ジョブが完了していない場合は400エラーを返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'processing',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectErrorResponse(response, data, 'ジョブが完了してから共有を有効化してください')
    })

    it('最大有効期限（168時間）でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 168, // 1週間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 168)
    })

    it('最小有効期限（1時間）でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        expiresIn: 1, // 1時間
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
      expectExpiryTime(data.expiresAt, 1)
    })

    it('空のepisodeNumbers配列でも正常に処理される', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'test-user-bypass',
      })
      const requestBody = {
        jobId: testJobId,
        episodeNumbers: [],
        expiresIn: 24,
      }

      const { response, data } = await makeShareRequest(requestBody)

      expectSuccessResponse(response, data)
    })
  })

  describe('GET /api/share/:jobId', () => {
    it('共有リンクが有効な場合に現在の状態を返す', async () => {
      const expiresAt = new Date(fixedNow.getTime() + 60 * 60 * 1000).toISOString()
      mockDbService.share.getShareByJobId.mockResolvedValue({
        id: 'share-record-id',
        jobId: testJobId,
        token: 'public-token-uuid',
        expiresAt,
        isEnabled: true,
        episodeNumbers: [1, 2],
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
        disabledAt: null,
        lastAccessedAt: null,
      })

      const { response, data } = await callShareStatus('GET', testJobId)

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.share).toMatchObject({
        enabled: true,
        shareUrl: 'http://localhost:3000/share/public-token-uuid',
        expiresAt,
        episodeNumbers: [1, 2],
      })
    })

    it('共有リンクが無効な場合はenabledがfalseになる', async () => {
      mockDbService.share.getShareByJobId.mockResolvedValue({
        id: 'share-record-id',
        jobId: testJobId,
        token: 'public-token-uuid',
        expiresAt: null,
        isEnabled: false,
        episodeNumbers: [],
        createdAt: fixedNow.toISOString(),
        updatedAt: fixedNow.toISOString(),
        disabledAt: fixedNow.toISOString(),
        lastAccessedAt: null,
      })

      const { response, data } = await callShareStatus('GET', testJobId)

      expect(response.status).toBe(200)
      expect(data.share).toEqual({ enabled: false })
    })

    it('ジョブが存在しない場合は404を返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue(null)

      const { response, data } = await callShareStatus('GET', testJobId)

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
    })

    it('所有者以外は403を返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'someone-else',
      })

      const { response, data } = await callShareStatus('GET', testJobId)

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
    })
  })

  describe('DELETE /api/share/:jobId', () => {
    it('共有リンクを無効化する', async () => {
      const { response, data } = await callShareStatus('DELETE', testJobId)

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockDbService.share.disableShare).toHaveBeenCalledWith(testJobId)
    })

    it('ジョブが存在しない場合は404を返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue(null)

      const { response, data } = await callShareStatus('DELETE', testJobId)

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
    })

    it('所有者以外は403を返す', async () => {
      mockDbService.jobs.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        userId: 'other-user',
      })

      const { response, data } = await callShareStatus('DELETE', testJobId)

      expect(response.status).toBe(403)
      expect(data.success).toBe(false)
      expect(mockDbService.share.disableShare).not.toHaveBeenCalled()
    })
  })
})
