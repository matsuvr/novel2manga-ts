import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/jobs/[jobId]/resume/route'
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
