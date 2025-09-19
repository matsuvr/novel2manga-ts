/**
 * Database Services Mock Configuration
 *
 * Provides comprehensive mocking for all database services
 * including the factory pattern and individual service classes.
 */

import { vi } from 'vitest'
import { DatabaseMockFactory } from '../factories/database-mock-factory'

// Mock service implementations with proper CRUD operations
const createMockService = () => ({
  // Common CRUD operations
  create: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  findById: vi.fn().mockResolvedValue(null),
  findMany: vi.fn().mockResolvedValue([]),
  update: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  delete: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  count: vi.fn().mockResolvedValue(0),
})

// Mock individual database services
export const mockJobService = {
  ...createMockService(),
  getJob: vi.fn().mockResolvedValue(null),
  getJobsByNovelId: vi.fn().mockResolvedValue([]),
  getJobWithProgress: vi.fn().mockResolvedValue(null),
  createJobRecord: vi.fn().mockImplementation(({ id }) => id || 'mock-job-id'),
  updateJobStatus: vi.fn().mockResolvedValue(undefined),
  updateJobStep: vi.fn().mockResolvedValue(undefined),
  markJobStepCompleted: vi.fn().mockResolvedValue(undefined),
  updateJobTotalPages: vi.fn().mockResolvedValue(undefined),
  updateJobError: vi.fn().mockResolvedValue(undefined),
  updateProcessingPosition: vi.fn().mockResolvedValue(undefined),
}

export const mockEpisodeService = {
  ...createMockService(),
  getEpisodesByJobId: vi.fn().mockResolvedValue([]),
  updateEpisodeTextPath: vi.fn().mockResolvedValue(undefined),
  createEpisodes: vi.fn().mockResolvedValue(undefined),
}

export const mockNovelService = {
  ...createMockService(),
  ensureNovel: vi.fn().mockResolvedValue({ id: 'mock-novel-id' }),
  getNovel: vi.fn().mockResolvedValue(null),
  getAllNovels: vi.fn().mockResolvedValue([]),
  createNovel: vi.fn().mockResolvedValue({ id: 'mock-novel-id' }),
}

export const mockChunkService = {
  ...createMockService(),
  getChunksByJobId: vi.fn().mockResolvedValue([]),
  createChunk: vi.fn().mockResolvedValue('mock-chunk-id'),
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

export const mockRenderService = {
  ...createMockService(),
  upsertRenderStatus: vi.fn().mockResolvedValue(undefined),
  getAllRenderStatusByJob: vi.fn().mockResolvedValue([]),
  updateRenderStatus: vi.fn().mockResolvedValue(undefined),
  getPerEpisodeRenderProgress: vi.fn().mockResolvedValue({}),
}

export const mockLayoutService = {
  ...createMockService(),
  upsertLayoutStatus: vi.fn().mockResolvedValue(undefined),
  getLayoutStatusByJobId: vi.fn().mockResolvedValue([]),
}

export const mockOutputService = {
  ...createMockService(),
  createOutput: vi.fn().mockResolvedValue('mock-output-id'),
  getOutput: vi.fn().mockResolvedValue(null),
}

export const mockTokenUsageService = {
  ...createMockService(),
  recordTokenUsage: vi.fn().mockResolvedValue(undefined),
  getTokenUsageByJob: vi.fn().mockResolvedValue([]),
}

export const mockTransactionService = {
  execute: vi.fn().mockImplementation((callback) => callback(mockDatabase)),
  executeSync: vi.fn().mockImplementation((callback) => callback(mockDatabase)),
}

// Mock database service factory
export const mockDatabaseServiceFactory = {
  episodes: vi.fn().mockReturnValue(mockEpisodeService),
  jobs: vi.fn().mockReturnValue(mockJobService),
  novels: vi.fn().mockReturnValue(mockNovelService),
  chunks: vi.fn().mockReturnValue(mockChunkService),
  chunkConversion: vi.fn().mockReturnValue(mockChunkConversionService),
  render: vi.fn().mockReturnValue(mockRenderService),
  layout: vi.fn().mockReturnValue(mockLayoutService),
  outputs: vi.fn().mockReturnValue(mockOutputService),
  tokenUsage: vi.fn().mockReturnValue(mockTokenUsageService),
  transactions: vi.fn().mockReturnValue(mockTransactionService),
  executeAcrossDomains: vi.fn().mockImplementation((callback) =>
    callback({
      episodes: mockEpisodeService,
      jobs: mockJobService,
      novels: mockNovelService,
      chunks: mockChunkService,
      chunkConversion: mockChunkConversionService,
      render: mockRenderService,
      layout: mockLayoutService,
      outputs: mockOutputService,
      tokenUsage: mockTokenUsageService,
      tx: mockTransactionService,
    }),
  ),
  getRawDatabase: vi.fn().mockReturnValue({}),
  getAdapter: vi.fn().mockReturnValue({}),
}

// Mock the main database object
export const mockDatabase = {
  // Service accessors
  episodes: vi.fn().mockReturnValue(mockEpisodeService),
  jobs: vi.fn().mockReturnValue(mockJobService),
  novels: vi.fn().mockReturnValue(mockNovelService),
  chunks: vi.fn().mockReturnValue(mockChunkService),
  chunkConversion: vi.fn().mockReturnValue(mockChunkConversionService),
  render: vi.fn().mockReturnValue(mockRenderService),
  layout: vi.fn().mockReturnValue(mockLayoutService),
  outputs: vi.fn().mockReturnValue(mockOutputService),
  tokenUsage: vi.fn().mockReturnValue(mockTokenUsageService),
  transactions: vi.fn().mockReturnValue(mockTransactionService),
  executeAcrossDomains: mockDatabaseServiceFactory.executeAcrossDomains,
  isSync: vi.fn().mockReturnValue(true),
}

// Mock factory functions
export const mockInitializeDatabaseServiceFactory = vi.fn()
export const mockGetDatabaseServiceFactory = vi.fn().mockReturnValue(mockDatabaseServiceFactory)
export const mockIsFactoryInitialized = vi.fn().mockReturnValue(true)
export const mockCleanup = vi.fn()

// Mock DatabaseService class for legacy compatibility
export class MockDatabaseService {
  public db = {}

  async createJob(payload: any): Promise<string> {
    return mockJobService.createJobRecord(payload)
  }

  async createChunk(payload: any): Promise<string> {
    return mockChunkService.createChunk(payload)
  }

  async getJob(id: string, _userId?: string) {
    return mockJobService.getJob(id)
  }

  async updateJobStatus(id: string, status: string, error?: string) {
    return mockJobService.updateJobStatus(id, status, error)
  }

  async getLayoutStatusByJobId(jobId: string) {
    return mockLayoutService.getLayoutStatusByJobId(jobId)
  }

  async createNovel(novel: any): Promise<string> {
    const result = await mockNovelService.createNovel(novel)
    return result.id
  }

  async getEpisodesByJobId(jobId: string) {
    return mockEpisodeService.getEpisodesByJobId(jobId)
  }

  async getJobWithProgress(id: string) {
    return mockJobService.getJobWithProgress(id)
  }

  async updateRenderStatus(jobId: string, episodeNumber: number, pageNumber: number, status: any) {
    return mockRenderService.upsertRenderStatus(jobId, episodeNumber, pageNumber, status)
  }

  async updateProcessingPosition(jobId: string, params: any) {
    return mockJobService.updateProcessingPosition(jobId, params)
  }

  async createEpisodes(episodes: any[]): Promise<void> {
    return mockEpisodeService.createEpisodes(episodes)
  }
}

// Helper functions for test setup
export const setupDatabaseMocks = () => {
  // Reset all mocks
  Object.values(mockJobService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockEpisodeService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockNovelService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockChunkService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockRenderService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockLayoutService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
  Object.values(mockOutputService).forEach((mock) => {
    if (vi.isMockFunction(mock)) mock.mockClear()
  })
}

// Configure mock responses for common test scenarios
export const configureMockForUser = (user = DatabaseMockFactory.createUser()) => {
  // Configure user-related mocks
  mockNovelService.getAllNovels.mockResolvedValue([])
  mockJobService.getJobsByNovelId.mockResolvedValue([])
  return user
}

export const configureMockForJob = (job = DatabaseMockFactory.createJob()) => {
  mockJobService.getJob.mockResolvedValue(job)
  mockJobService.getJobWithProgress.mockResolvedValue(job)
  mockEpisodeService.getEpisodesByJobId.mockResolvedValue([])
  mockChunkService.getChunksByJobId.mockResolvedValue([])
  return job
}

export const configureMockForCompleteWorkflow = () => {
  const workflow = DatabaseMockFactory.createCompleteWorkflow()

  mockJobService.getJob.mockResolvedValue(workflow.job)
  mockNovelService.getNovel.mockResolvedValue(workflow.novel)
  mockEpisodeService.getEpisodesByJobId.mockResolvedValue(workflow.episodes)
  mockChunkService.getChunksByJobId.mockResolvedValue(workflow.chunks)

  return workflow
}
