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

export const mockChunkConversionService = {
  ...createMockService(),
  getStatusesByJob: vi.fn().mockResolvedValue([]),
  getStatus: vi.fn().mockResolvedValue(null),
  ensureStatuses: vi.fn().mockResolvedValue(undefined),
  markProcessing: vi.fn().mockResolvedValue(undefined),
  markCompleted: vi.fn().mockResolvedValue(undefined),
  markFailed: vi.fn().mockResolvedValue(undefined),
}

export const mockDatabase = {
  jobs: () => mockJobService,
  episodes: () => mockEpisodeService,
  novels: () => mockNovelService,
  chunks: () => mockChunkService,
  chunkConversion: () => mockChunkConversionService,
  render: () => ({ upsertRenderStatus: vi.fn().mockResolvedValue(undefined) }),
}

export const mockDatabaseServiceFactory = {
  jobs: () => mockJobService,
  episodes: () => mockEpisodeService,
  novels: () => mockNovelService,
  chunks: () => mockChunkService,
  chunkConversion: () => mockChunkConversionService,
  render: () => ({ upsertRenderStatus: vi.fn().mockResolvedValue(undefined) }),
}

export const mockInitializeDatabaseServiceFactory = vi.fn().mockResolvedValue(undefined)
export const mockGetDatabaseServiceFactory = vi.fn().mockReturnValue(mockDatabaseServiceFactory)
export const mockIsFactoryInitialized = vi.fn().mockReturnValue(true)
export const mockCleanup = vi.fn().mockResolvedValue(undefined)

export class MockDatabaseService {
  static _createJobImpl: ((job: any) => Promise<string>) | null = null
  static _createChunkImpl: ((chunk: any) => Promise<string>) | null = null
  static _getJobImpl: ((id: string) => Promise<any | null>) | null = null
  static _updateJobStatusImpl:
    | ((jobId: string, status: string, error?: string | null) => Promise<void>)
    | null = null
  static _getLayoutStatusByJobIdImpl: ((jobId: string) => Promise<any[]>) | null = null

  public db: unknown

  constructor(db?: unknown) {
    this.db = db ?? {}
  }

  async createJob(job: any): Promise<string> {
    if (MockDatabaseService._createJobImpl) return MockDatabaseService._createJobImpl(job)
    const r: any = await mockJobService.createJob(job)
    return r?.id ?? 'job-mock-id'
  }

  async createChunk(chunk: any): Promise<string> {
    if (MockDatabaseService._createChunkImpl) return MockDatabaseService._createChunkImpl(chunk)
    const r: any = await mockJobService.createChunk(chunk)
    return r?.id ?? 'chunk-mock-id'
  }

  async getJob(id: string): Promise<any | null> {
    if (MockDatabaseService._getJobImpl) return MockDatabaseService._getJobImpl(id)
    return mockJobService.getJob(id)
  }

  async updateJobStatus(jobId: string, status: string, error?: string | null): Promise<void> {
    if (MockDatabaseService._updateJobStatusImpl)
      return MockDatabaseService._updateJobStatusImpl(jobId, status, error)
    await mockJobService.updateJobStatus(jobId, status, error)
  }

  async getLayoutStatusByJobId(jobId: string): Promise<any[]> {
    if (MockDatabaseService._getLayoutStatusByJobIdImpl)
      return MockDatabaseService._getLayoutStatusByJobIdImpl(jobId)
    return mockJobService.getLayoutStatusByJobId(jobId)
  }
}

export default mockDatabase
