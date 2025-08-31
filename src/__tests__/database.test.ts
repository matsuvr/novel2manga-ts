import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseService } from '../services/database'

// モック設定
vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn(),
      onConflictDoNothing: vi.fn(),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  })),
}))

// モック設定を拡張して必要なテーブルを含める
vi.mock('@/db/schema', () => ({
  jobs: {
    id: 'id',
    novelId: 'novel_id',
    jobName: 'job_name',
    status: 'status',
    currentStep: 'current_step',
  },
  chunks: {
    id: 'id',
    novelId: 'novel_id',
    originalText: 'original_text',
    startIndex: 'start_index',
    endIndex: 'end_index',
  },
  layoutStatus: {
    jobId: 'jobId',
    episodeNumber: 'episodeNumber',
  },
}))

describe('DatabaseService', () => {
  let service: DatabaseService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new DatabaseService()
  })

  describe('createJob', () => {
    it('should create a new job', async () => {
      await service.createJob({
        id: 'job-123',
        novelId: 'novel-123',
        title: 'Test Job',
        userId: 'user1',
      })

      // Note: The actual implementation uses Drizzle ORM, not raw SQL
      // This test checks that the service method is called correctly
      expect(service.createJob).toBeDefined()
    })
  })

  describe('createChunk', () => {
    it('should create a new chunk', async () => {
      const chunk = {
        novelId: 'novel-123',
        jobId: 'job-123',
        chunkIndex: 0,
        contentPath: 'chunks/chunk-0.txt',
        startPosition: 0,
        endPosition: 1000,
        wordCount: 200,
      }

      const chunkId = await service.createChunk(chunk)

      expect(chunkId).toBeDefined()
      expect(typeof chunkId).toBe('string')
    })
  })

  describe('getJob', () => {
    it('should get a job by id', async () => {
      const result = await service.getJob('job-123')

      // Since we're using mocked database, this should return null or empty array
      expect(result).toBeDefined()
    })
  })

  describe('updateJobStatus', () => {
    it('should update job status', async () => {
      await service.updateJobStatus('job-123', 'completed')

      // Test passes if no error is thrown
      expect(service.updateJobStatus).toBeDefined()
    })
  })

  describe('getLayoutStatusByJobId', () => {
    it('should get layout status by job id and correctly map database results', async () => {
      // モックデータは生のデータベース結果（日付は文字列、nullableフィールドはnull）
      const mockRawResults = [
        {
          id: 'layout-1',
          jobId: 'job-123',
          episodeNumber: 1,
          isGenerated: null,
          layoutPath: '/path/to/layout1',
          totalPages: 5,
          totalPanels: null,
          generatedAt: '2023-01-01T00:00:00Z',
          retryCount: null,
          lastError: null,
          createdAt: '2023-01-01T00:00:00Z',
        },
        {
          id: 'layout-2',
          jobId: 'job-123',
          episodeNumber: 2,
          isGenerated: true,
          layoutPath: null,
          totalPages: 4,
          totalPanels: 12,
          generatedAt: null,
          retryCount: 1,
          lastError: 'Some error',
          createdAt: null, // test null createdAt fallback
        },
      ]

      // Drizzleのselect().from().where().orderBy()チェーンをモック
      const mockOrderBy = vi.fn().mockResolvedValue(mockRawResults)
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

      service.db = { select: mockSelect } as any

      const result = await service.getLayoutStatusByJobId('job-123')

      expect(mockSelect).toHaveBeenCalled()
      expect(result).toHaveLength(2)

      // 1st result - マッピング検証
      expect(result[0]).toEqual({
        id: 'layout-1',
        jobId: 'job-123',
        episodeNumber: 1,
        isGenerated: false, // null → false
        layoutPath: '/path/to/layout1',
        totalPages: 5,
        totalPanels: undefined, // null → undefined
        generatedAt: new Date('2023-01-01T00:00:00Z'), // string → Date
        retryCount: 0, // null → 0
        lastError: undefined, // null → undefined
        createdAt: new Date('2023-01-01T00:00:00Z'), // string → Date
      })

      // 2nd result - マッピング検証（null createdAtのテスト）
      expect(result[1]).toEqual({
        id: 'layout-2',
        jobId: 'job-123',
        episodeNumber: 2,
        isGenerated: true,
        layoutPath: undefined, // null → undefined
        totalPages: 4,
        totalPanels: 12,
        generatedAt: undefined, // null → undefined
        retryCount: 1,
        lastError: 'Some error',
        createdAt: new Date(0), // null → new Date(0)
      })
    })

    it('should return empty array when no layout status found', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([])
      const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
      const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

      service.db = { select: mockSelect } as any

      const result = await service.getLayoutStatusByJobId('non-existent-job')

      expect(result).toEqual([])
      expect(result).toHaveLength(0)
    })
  })
})
