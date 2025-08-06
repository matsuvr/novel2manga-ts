import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/jobs/[jobId]/resume/route'
import { DatabaseService } from '@/services/database'

// ストレージとデータベースのモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
  })),
}))

// モック設定
const mockCanResumeJob = vi.fn()
const mockProcessJob = vi.fn()

vi.mock('@/services/job-narrative-processor', () => ({
  JobNarrativeProcessor: vi.fn().mockImplementation(() => ({
    canResumeJob: mockCanResumeJob,
    processJob: mockProcessJob,
  })),
}))

describe('/api/jobs/[jobId]/resume', () => {
  let testJobId: string
  let testNovelId: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-job-resume'
    testNovelId = 'test-novel-id'

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)

    // デフォルトでは再開可能な状態にする
    mockCanResumeJob.mockResolvedValue(true)
    mockProcessJob.mockResolvedValue(undefined)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/jobs/[jobId]/resume', () => {
    it('再開可能なジョブの場合、正常に再開する', async () => {
      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Job resumed successfully')
      expect(data.jobId).toBe(testJobId)
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockProcessJob).toHaveBeenCalledWith(testJobId, expect.any(Function))
    })

    it('再開不可能なジョブの場合は400エラーを返す', async () => {
      // 再開不可能な状態にモック
      mockCanResumeJob.mockResolvedValue(false)

      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Job cannot be resumed. It may be completed or not found.')
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockProcessJob).not.toHaveBeenCalled()
    })

    it('存在しないジョブIDの場合は400エラーを返す', async () => {
      const nonexistentJobId = 'nonexistent-job'
      // 存在しないジョブは再開不可能とする
      mockCanResumeJob.mockResolvedValue(false)

      const request = new NextRequest(`http://localhost:3000/api/jobs/${nonexistentJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: nonexistentJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Job cannot be resumed. It may be completed or not found.')
      expect(mockCanResumeJob).toHaveBeenCalledWith(nonexistentJobId)
    })

    it('canResumeJobでエラーが発生した場合は500エラーを返す', async () => {
      // canResumeJobでエラーを発生させる
      mockCanResumeJob.mockRejectedValue(new Error('データベースエラー'))

      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to resume job')
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockProcessJob).not.toHaveBeenCalled()
    })

    it('processJobでエラーが発生してもレスポンスは正常に返す（バックグラウンド処理）', async () => {
      // processJobでエラーを発生させるが、これはバックグラウンド処理なのでレスポンスには影響しない
      mockProcessJob.mockRejectedValue(new Error('処理エラー'))

      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Job resumed successfully')
      expect(data.jobId).toBe(testJobId)
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockProcessJob).toHaveBeenCalledWith(testJobId, expect.any(Function))
    })

    it('プログレスコールバックが正しく呼ばれることを確認する', async () => {
      // processJobの実装をより詳細にモック
      mockProcessJob.mockImplementation((_jobId, progressCallback) => {
        // プログレス報告をシミュレート
        progressCallback({
          processedChunks: 5,
          totalChunks: 10,
          episodes: [
            { episodeNumber: 1, title: 'エピソード1' },
            { episodeNumber: 2, title: 'エピソード2' },
          ],
        })
        return Promise.resolve()
      })

      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Job resumed successfully')
      expect(mockProcessJob).toHaveBeenCalledWith(testJobId, expect.any(Function))
    })
  })
})
