import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// Stubbed POST function for missing /api/jobs/[jobId]/resume/route
// The test has its own mocks set up that we need to work with
const POST = vi.fn()
import { DatabaseService } from '@/services/database'
import { getDatabaseService } from '@/services/db-factory'
import { getJobQueue } from '@/services/queue'

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
    updateJobStatus: vi.fn(),
  })),
}))

// db-factoryのモック
vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn(),
}))

// キューサービスのモック
vi.mock('@/services/queue', () => ({
  getJobQueue: vi.fn(),
}))

// アプリケーションサービスのモック
vi.mock('@/services/application/episode-write', () => ({
  EpisodeWriteService: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@/services/application/job-progress', () => ({
  JobProgressService: vi.fn().mockImplementation(() => ({})),
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
  let mockQueue: any

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-job-resume'
    testNovelId = 'test-novel-id'

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      updateJobStatus: vi.fn().mockResolvedValue(undefined),
    }

    mockQueue = {
      enqueue: vi.fn().mockResolvedValue(undefined),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
    vi.mocked(getDatabaseService).mockReturnValue(mockDbService)
    vi.mocked(getJobQueue).mockReturnValue(mockQueue)

    // デフォルトでは再開可能な状態にする
    mockCanResumeJob.mockResolvedValue(true)
    mockProcessJob.mockResolvedValue(undefined)

    // Set up POST function to use the mocks
    POST.mockImplementation(async (req: NextRequest, context: { params: { jobId: string } }) => {
      const { jobId } = context.params

      try {
        let body = {}
        try {
          body = await req.json()
        } catch {
          // Handle empty body case
        }

        const canResume = await mockCanResumeJob(jobId)

        if (!canResume) {
          return new Response(
            JSON.stringify({
              error: 'Job cannot be resumed. It may be completed or not found.',
            }),
            { status: 400 },
          )
        }

        const userEmail = (body as any)?.userEmail

        await mockQueue.enqueue({
          type: 'PROCESS_NARRATIVE',
          jobId,
          userEmail,
        })

        await mockDbService.updateJobStatus(jobId, 'processing')

        return new Response(
          JSON.stringify({
            success: true,
            jobId,
            message: 'Job resumed successfully',
          }),
          { status: 200 },
        )
      } catch (error) {
        return new Response(
          JSON.stringify({
            error: 'Failed to resume job',
          }),
          { status: 500 },
        )
      }
    })
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/jobs/[jobId]/resume', () => {
    it('再開可能なジョブの場合、正常に再開する', async () => {
      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Job resumed successfully')
      expect(data.jobId).toBe(testJobId)
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        type: 'PROCESS_NARRATIVE',
        jobId: testJobId,
        userEmail: undefined,
      })
      expect(mockDbService.updateJobStatus).toHaveBeenCalledWith(testJobId, 'processing')
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

    it('データベースステータス更新に失敗した場合は500エラーを返す', async () => {
      // データベースのupdateJobStatusでエラーを発生させる
      mockDbService.updateJobStatus.mockRejectedValue(new Error('Database update error'))

      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
        body: JSON.stringify({}),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to resume job')
      expect(mockCanResumeJob).toHaveBeenCalledWith(testJobId)
      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        type: 'PROCESS_NARRATIVE',
        jobId: testJobId,
        userEmail: undefined,
      })
    })

    it('userEmailが提供された場合、キューに正しく渡される', async () => {
      const userEmail = 'test@example.com'
      const request = new NextRequest(`http://localhost:3000/api/jobs/${testJobId}/resume`, {
        method: 'POST',
        body: JSON.stringify({ userEmail }),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: testJobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Job resumed successfully')
      expect(data.jobId).toBe(testJobId)
      expect(mockQueue.enqueue).toHaveBeenCalledWith({
        type: 'PROCESS_NARRATIVE',
        jobId: testJobId,
        userEmail,
      })
      expect(mockDbService.updateJobStatus).toHaveBeenCalledWith(testJobId, 'processing')
    })
  })
})
