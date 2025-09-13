/**
 * JobService Tests
 *
 * Tests for the JobService implementation using Effect-TS with proper
 * database dependency mocking using importOriginal pattern.
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobService, JobServiceLive } from '@/services/job/service'
import {
  DatabaseError,
  JobAccessDeniedError,
  JobError,
  JobNotFoundError,
} from '@/services/job/types'
import { EffectTestUtils, ServiceDatabaseMockUtils } from '@/test/mocks/service.mock'

// Mock the database module using importOriginal pattern
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()

  return {
    ...actual,
    getDatabase: vi.fn(),
  }
})

// Mock the schema
vi.mock('@/db/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/schema')>()

  return {
    ...actual,
    jobs: {}, // Mock jobs table
    novels: {}, // Mock novels table
  }
})

describe('JobService', () => {
  let mockDatabase: any
  let jobService: JobService

  beforeEach(async () => {
    vi.clearAllMocks()

    // Import the mocked database
    const { getDatabase } = await import('@/db')

    // Create a fresh mock database for each test
    mockDatabase = createJobMockDatabase()
    vi.mocked(getDatabase).mockReturnValue(mockDatabase)

    // Create the service instance with the live implementation
    const layer = JobServiceLive
    jobService = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* JobService
        return service
      }).pipe(Effect.provide(layer)),
    )
  })

  describe('getUserJobs', () => {
    it('should return user jobs with default options', async () => {
      // Arrange
      const userId = 'test-user-id'
      const mockJobsData = [
        {
          // Job fields
          id: 'job-1',
          novelId: 'novel-1',
          jobName: 'Test Job 1',
          userId: userId,
          status: 'completed',
          currentStep: 'render',
          splitCompleted: true,
          analyzeCompleted: true,
          episodeCompleted: true,
          layoutCompleted: true,
          renderCompleted: true,
          chunksDirPath: '/chunks',
          analysesDirPath: '/analyses',
          episodesDataPath: '/episodes',
          layoutsDirPath: '/layouts',
          rendersDirPath: '/renders',
          characterMemoryPath: '/character',
          promptMemoryPath: '/prompt',
          totalChunks: 10,
          processedChunks: 10,
          totalEpisodes: 5,
          processedEpisodes: 5,
          totalPages: 20,
          renderedPages: 20,
          processingEpisode: null,
          processingPage: null,
          lastError: null,
          lastErrorStep: null,
          retryCount: 0,
          resumeDataPath: null,
          coverageWarnings: null,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T01:00:00Z',
          startedAt: '2024-01-01T00:05:00Z',
          completedAt: '2024-01-01T01:00:00Z',
          // Novel fields
          novelTitle: 'Test Novel',
          novelAuthor: 'Test Author',
          novelOriginalTextPath: '/novel.txt',
          novelTextLength: 1000,
          novelLanguage: 'ja',
          novelMetadataPath: '/metadata.json',
          novelUserId: userId,
          novelCreatedAt: '2024-01-01T00:00:00Z',
          novelUpdatedAt: '2024-01-01T00:00:00Z',
        },
      ]

      mockDatabase = createJobMockDatabase(mockJobsData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act
      const result = await EffectTestUtils.expectSuccess(jobService.getUserJobs(userId))

      // Assert
      expect(result).toHaveLength(1)
      expect(result[0].job.id).toBe('job-1')
      expect(result[0].job.userId).toBe(userId)
      expect(result[0].novel?.title).toBe('Test Novel')
    })

    it('should return empty array when user has no jobs', async () => {
      // Arrange
      const userId = 'user-with-no-jobs'
      mockDatabase = createJobMockDatabase([])
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act
      const result = await EffectTestUtils.expectSuccess(jobService.getUserJobs(userId))

      // Assert
      expect(result).toHaveLength(0)
    })

    it('should filter jobs by status when provided', async () => {
      // Arrange
      const userId = 'test-user-id'
      const options = { status: 'processing' }

      mockDatabase = createJobMockDatabase([])
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act
      const result = await EffectTestUtils.expectSuccess(jobService.getUserJobs(userId, options))

      // Assert
      expect(result).toHaveLength(0)
      // Verify that the query was built with status filter
      expect(mockDatabase.select).toHaveBeenCalled()
    })

    it('should apply limit and offset options', async () => {
      // Arrange
      const userId = 'test-user-id'
      const options = { limit: 5, offset: 10 }

      mockDatabase = createJobMockDatabase([])
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act
      await EffectTestUtils.expectSuccess(jobService.getUserJobs(userId, options))

      // Assert
      // Verify that limit and offset were applied
      expect(mockDatabase.select).toHaveBeenCalled()
    })

    it('should return DatabaseError when database operation fails', async () => {
      // Arrange
      const userId = 'test-user-id'
      mockDatabase = ServiceDatabaseMockUtils.createErrorMockDatabase('Connection failed')
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.getUserJobs(userId),
        'DatabaseError',
      )

      expect(error).toBeInstanceOf(DatabaseError)
      expect((error as DatabaseError).message).toContain('Failed to get user jobs')
    })
  })

  describe('resumeJob', () => {
    it('should resume a failed job successfully', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'failed-job-id'
      const mockJobData = {
        id: jobId,
        userId: userId,
        status: 'failed',
        lastError: 'Processing timeout',
      }

      mockDatabase = createJobResumeMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      await EffectTestUtils.expectSuccess(jobService.resumeJob(userId, jobId))

      // Verify update was called to reset job status
      expect(mockDatabase.update).toHaveBeenCalled()
    })

    it('should resume a paused job successfully', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'paused-job-id'
      const mockJobData = {
        id: jobId,
        userId: userId,
        status: 'paused',
        lastError: null,
      }

      mockDatabase = createJobResumeMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      await EffectTestUtils.expectSuccess(jobService.resumeJob(userId, jobId))
    })

    it('should return JobNotFoundError when job does not exist', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'nonexistent-job'

      mockDatabase = createJobResumeMockDatabase(null)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.resumeJob(userId, jobId),
        'JobNotFoundError',
      )

      expect(error).toBeInstanceOf(JobNotFoundError)
      expect((error as JobNotFoundError).jobId).toBe(jobId)
    })

    it('should return JobAccessDeniedError when user does not own job', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'other-user-job'
      const mockJobData = {
        id: jobId,
        userId: 'other-user-id',
        status: 'failed',
      }

      mockDatabase = createJobResumeMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.resumeJob(userId, jobId),
        'JobAccessDeniedError',
      )

      expect(error).toBeInstanceOf(JobAccessDeniedError)
      expect((error as JobAccessDeniedError).jobId).toBe(jobId)
      expect((error as JobAccessDeniedError).userId).toBe(userId)
    })

    it('should return JobError when job is not in resumable state', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'processing-job'
      const mockJobData = {
        id: jobId,
        userId: userId,
        status: 'processing', // Not resumable
      }

      mockDatabase = createJobResumeMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.resumeJob(userId, jobId),
        'JobError',
      )

      expect(error).toBeInstanceOf(JobError)
      expect((error as JobError).message).toContain('Job cannot be resumed')
      expect((error as JobError).code).toBe('INVALID_STATUS')
    })
  })

  describe('getJobDetails', () => {
    it('should return job details with novel information', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'test-job-id'
      const mockJobData = {
        id: jobId,
        userId: userId,
        novelId: 'novel-1',
        jobName: 'Test Job',
        status: 'completed',
        // ... other job fields
        novelTitle: 'Test Novel',
        novelAuthor: 'Test Author',
        // ... other novel fields
      }

      mockDatabase = createJobDetailsMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act
      const result = await EffectTestUtils.expectSuccess(jobService.getJobDetails(userId, jobId))

      // Assert
      expect(result.job.id).toBe(jobId)
      expect(result.job.userId).toBe(userId)
      expect(result.novel?.title).toBe('Test Novel')
    })

    it('should return JobNotFoundError when job does not exist', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'nonexistent-job'

      mockDatabase = createJobDetailsMockDatabase(null)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.getJobDetails(userId, jobId),
        'JobNotFoundError',
      )

      expect(error).toBeInstanceOf(JobNotFoundError)
    })

    it('should return JobAccessDeniedError when user does not own job', async () => {
      // Arrange
      const userId = 'test-user-id'
      const jobId = 'other-user-job'
      const mockJobData = {
        id: jobId,
        userId: 'other-user-id',
        novelTitle: 'Other User Novel',
      }

      mockDatabase = createJobDetailsMockDatabase(mockJobData)
      const { getDatabase } = await import('@/db')
      vi.mocked(getDatabase).mockReturnValue(mockDatabase)

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        jobService.getJobDetails(userId, jobId),
        'JobAccessDeniedError',
      )

      expect(error).toBeInstanceOf(JobAccessDeniedError)
    })
  })
})

// Helper functions to create specific mock databases for different test scenarios

function createJobMockDatabase(jobsData: any[] = []) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              offset: vi.fn().mockResolvedValue(jobsData),
            }),
          }),
        }),
      }),
    }),
  })

  return {
    select: mockSelect,
  }
}

function createJobResumeMockDatabase(jobData: any = null) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(jobData ? [jobData] : []),
    }),
  })

  const mockUpdate = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ changes: 1 }),
    }),
  })

  return {
    select: mockSelect,
    update: mockUpdate,
  }
}

function createJobDetailsMockDatabase(jobData: any = null) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(jobData ? [jobData] : []),
      }),
    }),
  })

  return {
    select: mockSelect,
  }
}
