import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JobService, JobServiceLive } from '@/services/job/service'
import { StorageFactory } from '@/utils/storage'

// Helper to create a fake DB row result shape matching JobService query
function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'job-1',
    novelId: 'novel-1',
    jobName: 'Analysis Job for Novel',
    userId: 'user-1',
    status: 'completed',
    currentStep: null,
    splitCompleted: 1,
    analyzeCompleted: 1,
    episodeCompleted: 1,
    layoutCompleted: 1,
    renderCompleted: 1,
    chunksDirPath: null,
    analysesDirPath: null,
    episodesDataPath: null,
    layoutsDirPath: null,
    rendersDirPath: null,
    characterMemoryPath: null,
    promptMemoryPath: null,
    totalChunks: 0,
    processedChunks: 0,
    totalEpisodes: 0,
    processedEpisodes: 0,
    totalPages: 0,
    renderedPages: 0,
    processingEpisode: null,
    processingPage: null,
    lastError: null,
    lastErrorStep: null,
    retryCount: 0,
    resumeDataPath: null,
    coverageWarnings: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    novelTitle: 'Some Novel',
    novelAuthor: 'Author',
    novelOriginalTextPath: 'wrapped-key.json',
    novelTextLength: 1234,
    novelLanguage: 'ja',
    novelMetadataPath: null,
    novelUserId: 'user-1',
    novelCreatedAt: new Date().toISOString(),
    novelUpdatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// Mock the database module so that getDatabase is a mock function we can control
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return {
    ...(actual as object),
    getDatabase: vi.fn(),
  }
})


describe('JobService preview unwrap', () => {
  let jobService: any

  beforeEach(async () => {
    vi.resetAllMocks()
    // Create mock DB that returns a single row
    const { getDatabase } = await import('@/db')
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([makeRow()]),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    // Provide the layer and obtain the service instance
    jobService = await Effect.runPromise(
      Effect.gen(function* () {
        const s = yield* JobService
        return s
      }).pipe(Effect.provide(JobServiceLive)),
    )
  })

  it('unwraps nested JSON from storage and sets novel.preview', async () => {
    const doubleWrapped = JSON.stringify({ text: JSON.stringify({ text: 'こんにちは世界これはテストの本文です' }) })

    const mockNovelStorage = {
      get: vi.fn().mockResolvedValue({ text: doubleWrapped }),
    }

    // Mock getDatabase to return a mock that yields our single row
    const { getDatabase } = await import('@/db')
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue([makeRow()]),
                }),
              }),
            }),
          }),
        }),
      }),
    }
    vi.mocked(getDatabase).mockReturnValue(mockDb as any)

    // The service under test imports `getNovelStorage` as a named export via
    // dynamic import. Spy the actual module export so the call inside
    // `getUserJobs` picks up our mock.
    const storageModule = await import('@/utils/storage')
    vi.spyOn(storageModule, 'getNovelStorage').mockResolvedValue(mockNovelStorage as any)

    // Provide the layer and obtain the service instance
    const jobService = await Effect.runPromise(
      Effect.gen(function* () {
        const s = yield* JobService
        return s
      }).pipe(Effect.provide(JobServiceLive)),
    )

    const result = await Effect.runPromise(jobService.getUserJobs('user-1'))

    expect(result.length).toBeGreaterThan(0)
    const first = result[0]
    expect(first.novel).not.toBeNull()
    expect(first.novel?.preview).toBe('こんにちは世界これはテストの本文です'.slice(0, 100))
    expect(mockNovelStorage.get).toHaveBeenCalledWith('wrapped-key.json')
  })
})
