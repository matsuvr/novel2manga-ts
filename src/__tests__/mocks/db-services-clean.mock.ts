// src/__tests__/mocks/db-services-clean.mock.ts
// Clean replacement for database-services.mock.ts to avoid corrupted file issues.

import { vi } from 'vitest'

const createMockService = () => ({
  create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  delete: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  count: vi.fn().mockResolvedValue(0),
})

export const mockJobService = {
  ...createMockService(),
  getJob: vi.fn().mockResolvedValue(null),
  getJobsByNovelId: vi.fn().mockResolvedValue([]),
  createJob: vi.fn().mockResolvedValue({ id: 'job-1' }),
  createChunk: vi.fn().mockResolvedValue({ id: 'chunk-1' }),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  getLayoutStatusByJobId: vi.fn().mockResolvedValue([]),
}

export const mockEpisodeService = {
  ...createMockService(),
  getEpisodesByJobId: vi.fn().mockResolvedValue([]),
}

export const mockNovelService = {
  ...createMockService(),
  ensureNovel: vi.fn().mockResolvedValue({ id: 'mock-novel-id' }),
  getNovel: vi.fn().mockResolvedValue(null),
}

export const mockChunkService = {
  ...createMockService(),
  getChunksByJobId: vi.fn().mockResolvedValue([]),
}

export const mockDatabase = {
  jobs: mockJobService,
  episodes: mockEpisodeService,
  novels: mockNovelService,
  chunks: mockChunkService,
}

export const mockDatabaseServiceFactory = {
  createJobService: () => mockJobService,
  createEpisodeService: () => mockEpisodeService,
  createNovelService: () => mockNovelService,
  createChunkService: () => mockChunkService,
}

export const mockInitializeDatabaseServiceFactory = vi.fn().mockResolvedValue(undefined)
export const mockGetDatabaseServiceFactory = vi.fn().mockReturnValue(mockDatabaseServiceFactory)
export const mockIsFactoryInitialized = vi.fn().mockReturnValue(true)
export const mockCleanup = vi.fn().mockResolvedValue(undefined)

export class MockDatabaseService {
  async createJob(job: any): Promise<string> {
    return mockJobService.createJob(job).then((r: any) => r.id ?? 'job-mock-id')
  }

  async createChunk(chunk: any): Promise<string> {
    return mockJobService.createChunk(chunk).then((r: any) => r.id ?? 'chunk-mock-id')
  }

  async getJob(id: string): Promise<any | null> {
    return mockJobService.getJob(id)
  }

  async updateJobStatus(jobId: string, status: string, error?: string | null): Promise<void> {
    return mockJobService.updateJobStatus(jobId, status, error)
  }

  async getLayoutStatusByJobId(jobId: string): Promise<any[]> {
    return mockJobService.getLayoutStatusByJobId(jobId)
  }
}

export default mockDatabase
