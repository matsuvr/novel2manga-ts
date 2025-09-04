import type { Mocked } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Episode, Job, RenderStatus } from '@/db'
import type { LayoutStoragePort } from '@/infrastructure/storage/ports'
import { JobProgressService } from '@/services/application/job-progress'
import type { JobProgress } from '@/types/job'

// Mock dependencies
vi.mock('@/services/database/index', () => ({
  db: {
    jobs: () => ({
      getJobWithProgress: vi.fn((...args: any[]) =>
        mockJobDbPort.getJobWithProgress(...(args as any)),
      ),
      updateJobStatus: vi.fn(),
      updateJobStep: vi.fn(),
      markJobStepCompleted: vi.fn(),
      updateJobProgress: vi.fn(),
      updateJobError: vi.fn(),
    }),
    episodes: () => ({
      getEpisodesByJobId: vi.fn((...args: any[]) =>
        mockDatabaseService.getEpisodesByJobId(...(args as any)),
      ),
    }),
    render: () => ({
      getAllRenderStatusByJob: vi.fn((...args: any[]) =>
        mockDatabaseService.getAllRenderStatusByJob(...(args as any)),
      ),
    }),
  },
}))

vi.mock('@/infrastructure/storage/ports', () => ({
  getStoragePorts: vi.fn(() => ({
    layout: mockLayoutStorage,
  })),
}))

// repositories no longer used

// Mock objects (strictly typed)
type MockDb = Pick<
  {
    getEpisodesByJobId(jobId: string): Promise<Episode[]>
    getAllRenderStatusByJob(jobId: string): Promise<RenderStatus[]>
  },
  'getEpisodesByJobId' | 'getAllRenderStatusByJob'
>
type MockLayout = Pick<LayoutStoragePort, 'getEpisodeLayoutProgress'>
type MockJobPort = Pick<
  { getJobWithProgress(id: string): Promise<Job & { progress: any }> },
  'getJobWithProgress'
>

let mockDatabaseService: Mocked<MockDb>
let mockLayoutStorage: Mocked<MockLayout>
let mockJobDbPort: Mocked<MockJobPort>

beforeEach(() => {
  vi.clearAllMocks()

  // Mock database service concisely
  mockDatabaseService = {
    getEpisodesByJobId: vi.fn(),
    getAllRenderStatusByJob: vi.fn(),
  } as Mocked<MockDb>

  // Mock layout storage concisely
  mockLayoutStorage = {
    getEpisodeLayoutProgress: vi.fn(),
  } as Mocked<MockLayout>

  // Mock job database port concisely
  mockJobDbPort = {
    getJobWithProgress: vi.fn(),
  } as Mocked<MockJobPort>
})

describe('JobProgressService Integration Tests', () => {
  describe('getJobWithProgress', () => {
    // Helper to build a fully-typed Job object with sensible defaults
    // Consolidates job and progress data to avoid duplication
    const makeMockJob = (
      jobOverrides: Partial<Job> = {},
      progressOverrides: Partial<
        Omit<JobProgress, 'currentStep' | 'processedChunks' | 'totalChunks'>
      > = {},
    ): Job & { progress: JobProgress } => {
      const now = new Date().toISOString()
      const base: Job = {
        id: 'job-DEFAULT',
        novelId: 'novel-DEFAULT',
        jobName: null,
        status: 'pending',
        currentStep: 'initialized',
        splitCompleted: false,
        analyzeCompleted: false,
        episodeCompleted: false,
        layoutCompleted: false,
        renderCompleted: false,
        chunksDirPath: null,
        analysesDirPath: null,
        episodesDataPath: null,
        layoutsDirPath: null,
        rendersDirPath: null,
        totalChunks: 0,
        processedChunks: 0,
        totalEpisodes: 0,
        processedEpisodes: 0,
        totalPages: 0,
        renderedPages: 0,
        lastError: null,
        lastErrorStep: null,
        retryCount: 0,
        resumeDataPath: null,
        createdAt: now,
        updatedAt: now,
        startedAt: now,
        completedAt: null,
      }
      const job = { ...base, ...jobOverrides }

      // Progress data is derived from job data to ensure consistency
      const progress: JobProgress = {
        currentStep: job.currentStep as JobProgress['currentStep'],
        processedChunks: job.processedChunks ?? 0,
        totalChunks: job.totalChunks ?? 0,
        episodes: [],
        ...progressOverrides,
      }
      return { ...job, progress }
    }
    it('returns null when job does not exist', async () => {
      // Arrange
      mockJobDbPort.getJobWithProgress.mockResolvedValue(null)
      const service = new JobProgressService()

      // Act
      const result = await service.getJobWithProgress('nonexistent-job')

      // Assert
      expect(result).toBeNull()
      expect(mockJobDbPort.getJobWithProgress).toHaveBeenCalledWith('nonexistent-job')
    })

    it('returns original job when no episodes exist', async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: 'job-1',
        novelId: 'novel-1',
        status: 'processing',
        currentStep: 'analyze',
        totalChunks: 10,
        processedChunks: 5,
      })

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob)
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue([])

      const service = new JobProgressService()

      // Act
      const result = await service.getJobWithProgress('job-1')

      // Assert
      expect(result).toEqual(mockJob)
      expect(mockDatabaseService.getEpisodesByJobId).toHaveBeenCalledWith('job-1')
    })

    it('enriches job with perEpisodePages when episodes exist', async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: 'job-1',
        novelId: 'novel-1',
        status: 'processing',
        currentStep: 'layout',
        totalChunks: 10,
        processedChunks: 10,
      })

      const mockEpisodes: Episode[] = [
        {
          id: 'ep1',
          novelId: 'novel-1',
          jobId: 'job-1',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: null,
          startChunk: 0,
          endChunk: 4,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'ep2',
          novelId: 'novel-1',
          jobId: 'job-1',
          episodeNumber: 2,
          title: 'Episode 2',
          summary: null,
          startChunk: 5,
          endChunk: 9,
          startCharIndex: 1001,
          endCharIndex: 2000,
          confidence: 0.85,
          createdAt: new Date().toISOString(),
        },
      ]

      const mockLayoutProgress1 = JSON.stringify({ pages: Array(25).fill({}) }) // 25 planned pages
      const mockLayoutProgress2 = JSON.stringify({
        pages: Array(35).fill({}),
        validation: {
          normalizedPages: [2, 5, 7],
          pagesWithIssueCounts: { 2: 3, 5: 1, 7: 2 },
          pageIssues: { 2: ['overlap'], 5: ['gap'], 7: ['coverage'] },
        },
      }) // 35 planned pages + validation
      const mockRenderStatus1: RenderStatus[] = [] // 0 rendered pages
      const mockRenderStatus2: RenderStatus[] = [
        {
          id: 'r-1',
          jobId: 'job-1',
          episodeNumber: 2,
          pageNumber: 1,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'r-2',
          jobId: 'job-1',
          episodeNumber: 2,
          pageNumber: 2,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'r-3',
          jobId: 'job-1',
          episodeNumber: 2,
          pageNumber: 3,
          isRendered: true,
          imagePath: null,
          thumbnailPath: null,
          width: null,
          height: null,
          fileSize: null,
          renderedAt: null,
          retryCount: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        },
      ]

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob)
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue(mockEpisodes)
      mockLayoutStorage.getEpisodeLayoutProgress
        .mockResolvedValueOnce(mockLayoutProgress1)
        .mockResolvedValueOnce(mockLayoutProgress2)

      // Return all render statuses for the job
      mockDatabaseService.getAllRenderStatusByJob.mockResolvedValue(mockRenderStatus2)

      const service = new JobProgressService()

      // Act
      const result = await service.getJobWithProgress('job-1')

      // Assert
      expect(result).toBeDefined()
      expect(result?.progress?.perEpisodePages).toBeDefined()

      const perEpisodePages = result!.progress!.perEpisodePages!

      // Episode 1: actualPages=25, rendered=0 (validation may be present with defaults)
      expect(perEpisodePages[1]).toMatchObject({
        actualPages: 25,
        rendered: 0,
        validation: expect.any(Object),
      })

      // Episode 2: actualPages=35, rendered=3 + validation present
      expect(perEpisodePages[2]).toMatchObject({
        actualPages: 35,
        rendered: 3,
        validation: {
          normalizedPages: [2, 5, 7],
          pagesWithIssueCounts: { 2: 3, 5: 1, 7: 2 },
          issuesCount: expect.any(Number),
        },
      })

      // Verify all mocks were called correctly
      expect(mockDatabaseService.getEpisodesByJobId).toHaveBeenCalledWith('job-1')
      expect(mockLayoutStorage.getEpisodeLayoutProgress).toHaveBeenCalledWith('job-1', 1)
      expect(mockLayoutStorage.getEpisodeLayoutProgress).toHaveBeenCalledWith('job-1', 2)
      expect(mockDatabaseService.getAllRenderStatusByJob).toHaveBeenCalledWith('job-1')
    })

    it('handles layout progress parsing errors gracefully', async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: 'job-1',
        novelId: 'novel-1',
        status: 'processing',
        currentStep: 'layout',
        totalChunks: 5,
        processedChunks: 5,
      })

      const mockEpisodes: Episode[] = [
        {
          id: 'ep1',
          novelId: 'novel-1',
          jobId: 'job-1',
          episodeNumber: 1,
          title: 'Episode 1',
          summary: null,
          startChunk: 0,
          endChunk: 4,
          startCharIndex: 0,
          endCharIndex: 1000,
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ]

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob)
      mockDatabaseService.getEpisodesByJobId.mockResolvedValue(mockEpisodes)
      // Return invalid JSON that will cause parsing to fail
      mockLayoutStorage.getEpisodeLayoutProgress.mockResolvedValue('invalid-json')
      mockDatabaseService.getAllRenderStatusByJob.mockResolvedValue([])

      const service = new JobProgressService()

      // Act
      const result = await service.getJobWithProgress('job-1')

      // Assert
      expect(result).toBeDefined()
      expect(result?.progress?.perEpisodePages).toBeDefined()

      const perEpisodePages = result!.progress!.perEpisodePages!

      // Should have actualPages=0 due to parsing error, but still include the episode
      expect(perEpisodePages[1]).toMatchObject({
        actualPages: 0, // Falls back to 0 when JSON parsing fails
        rendered: 0,
        validation: expect.any(Object),
      })
    })

    it('handles storage operation errors gracefully and returns original job', async () => {
      // Arrange
      const mockJob = makeMockJob({
        id: 'job-1',
        novelId: 'novel-1',
        status: 'processing',
        currentStep: 'layout',
        totalChunks: 5,
        processedChunks: 5,
      })

      mockJobDbPort.getJobWithProgress.mockResolvedValue(mockJob)
      // Simulate error in getEpisodesByJobId that triggers the catch block
      mockDatabaseService.getEpisodesByJobId.mockRejectedValue(
        new Error('Database connection failed'),
      )

      const service = new JobProgressService()

      // Act
      const result = await service.getJobWithProgress('job-1')

      // Assert
      // Should return original job when enrichment fails
      expect(result).toEqual(mockJob)
      expect(result?.progress?.perEpisodePages).toBeUndefined()
    })
  })
})
