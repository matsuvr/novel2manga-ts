/**
 * Job Service Unit Tests (moved)
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobService, JobServiceLive } from '../../../services/job/service'

// Mock the database
vi.mock('@/db', () => ({
  getDatabase: vi.fn(),
}))

// Import after mocking
import { getDatabase } from '@/db'

describe('JobService', () => {
  let mockDb: any

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock database
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
    }

    // Mock getDatabase to return our mock
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)
  })

  describe('getUserJobs', () => {
    it('should return user jobs with default pagination', async () => {
      const mockJobs = [
        {
          id: 'job1',
          novelId: 'novel1',
          userId: 'user1',
          status: 'completed',
          currentStep: 'render',
          jobName: 'Test Job',
          splitCompleted: true,
          analyzeCompleted: true,
          episodeCompleted: true,
          layoutCompleted: true,
          renderCompleted: true,
          totalChunks: 10,
          processedChunks: 10,
          totalEpisodes: 5,
          processedEpisodes: 5,
          totalPages: 20,
          renderedPages: 20,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T01:00:00Z',
          novelTitle: 'Test Novel',
          novelAuthor: 'Test Author',
        },
      ]

      // Mock the Drizzle query chain
      mockDb.select.mockReturnValue(mockDb)
      mockDb.from.mockReturnValue(mockDb)
      mockDb.leftJoin.mockReturnValue(mockDb)
      mockDb.where.mockReturnValue(mockDb)
      mockDb.orderBy.mockReturnValue(mockDb)
      mockDb.limit.mockReturnValue(mockDb)
      mockDb.offset.mockResolvedValue(mockJobs)

      const program = Effect.gen(function* () {
        const service = yield* JobService
        return yield* service.getUserJobs('user1')
      })

      const result = await Effect.runPromise(program.pipe(Effect.provide(JobServiceLive)))

      expect(result).toHaveLength(1)
      expect(result[0].job.id).toBe('job1')
      expect(result[0].job.userId).toBe('user1')
    })
  })
})
