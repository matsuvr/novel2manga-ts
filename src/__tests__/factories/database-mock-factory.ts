export * from '@test/factories/database-mock-factory'

/**
 * Database Mock Factory (migrated)
 *
 * Provides factory functions for creating consistent test data
 * across all test suites. Preserves a compatibility object
 * `DatabaseMockFactory` for existing call sites that use
 * `DatabaseMockFactory.createX(...)`.
 */

import type {
  Chunk,
  Episode,
  Job,
  LayoutStatus,
  Novel,
  Output,
  RenderStatus,
  User,
} from '@/db/schema'

export function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: null,
    image: null,
    createdAt: new Date().toISOString(),
    emailNotifications: true,
    theme: 'light',
    language: 'ja',
    ...overrides,
  }
}

export function createNovel(overrides: Partial<Novel> = {}): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    author: 'Test Author',
    originalTextPath: '/path/to/novel.txt',
    textLength: 10000,
    language: 'ja',
    metadataPath: '/path/to/metadata.json',
    userId: 'user-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    novelId: 'novel-1',
    jobName: 'Test Job',
    userId: 'user-1',
    status: 'pending',
    currentStep: 'initialized',
    splitCompleted: false,
    analyzeCompleted: false,
    episodeCompleted: false,
    layoutCompleted: false,
    renderCompleted: false,
    chunksDirPath: '/path/to/chunks',
    analysesDirPath: '/path/to/analyses',
    episodesDataPath: '/path/to/episodes',
    layoutsDirPath: '/path/to/layouts',
    rendersDirPath: '/path/to/renders',
    characterMemoryPath: '/path/to/character-memory',
    promptMemoryPath: '/path/to/prompt-memory',
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
    ...overrides,
  }
}

export function createEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'episode-1',
    novelId: 'novel-1',
    jobId: 'job-1',
    episodeNumber: 1,
    title: 'Test Episode',
    summary: 'Test episode summary',
    startChunk: 0,
    startCharIndex: 0,
    endChunk: 1,
    endCharIndex: 1000,
    confidence: 0.95,
    createdAt: new Date().toISOString(),
    episodeTextPath: '/path/to/episode.txt',
    ...overrides,
  }
}

export function createChunk(overrides: Partial<Chunk> = {}): Chunk {
  return {
    id: 'chunk-1',
    novelId: 'novel-1',
    jobId: 'job-1',
    chunkIndex: 0,
    contentPath: '/path/to/chunk.txt',
    startPosition: 0,
    endPosition: 1000,
    wordCount: 200,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createLayoutStatus(overrides: Partial<LayoutStatus> = {}): LayoutStatus {
  return {
    id: 'layout-1',
    jobId: 'job-1',
    episodeNumber: 1,
    isGenerated: false,
    layoutPath: null,
    totalPages: null,
    totalPanels: null,
    generatedAt: null,
    retryCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createRenderStatus(overrides: Partial<RenderStatus> = {}): RenderStatus {
  return {
    id: 'render-1',
    jobId: 'job-1',
    episodeNumber: 1,
    pageNumber: 1,
    isRendered: false,
    imagePath: null,
    thumbnailPath: null,
    width: null,
    height: null,
    fileSize: null,
    renderedAt: null,
    retryCount: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

export function createOutput(overrides: Partial<Output> = {}): Output {
  return {
    id: 'output-1',
    novelId: 'novel-1',
    jobId: 'job-1',
    outputType: 'manga',
    outputPath: '/path/to/output.pdf',
    fileSize: 1024000,
    pageCount: 10,
    metadataPath: '/path/to/output-metadata.json',
    createdAt: new Date().toISOString(),
    userId: 'user-1',
    ...overrides,
  }
}

export function createCompleteWorkflow(
  overrides: {
    user?: Partial<User>
    novel?: Partial<Novel>
    job?: Partial<Job>
    episodes?: Partial<Episode>[]
    chunks?: Partial<Chunk>[]
  } = {},
) {
  const user = createUser(overrides.user)
  const novel = createNovel({ userId: user.id, ...overrides.novel })
  const job = createJob({
    novelId: novel.id,
    userId: user.id,
    ...overrides.job,
  })

  const episodes = overrides.episodes?.map((ep, index) =>
    createEpisode({
      novelId: novel.id,
      jobId: job.id,
      episodeNumber: index + 1,
      ...ep,
    }),
  ) || [createEpisode({ novelId: novel.id, jobId: job.id })]

  const chunks = overrides.chunks?.map((chunk, index) =>
    createChunk({
      novelId: novel.id,
      jobId: job.id,
      chunkIndex: index,
      ...chunk,
    }),
  ) || [createChunk({ novelId: novel.id, jobId: job.id })]

  return {
    user,
    novel,
    job,
    episodes,
    chunks,
  }
}

export function createUsers(count: number, baseOverrides: Partial<User> = {}): User[] {
  return Array.from({ length: count }, (_, index) =>
    createUser({
      id: `user-${index + 1}`,
      email: `user${index + 1}@example.com`,
      name: `Test User ${index + 1}`,
      ...baseOverrides,
    }),
  )
}

export function createJobs(count: number, baseOverrides: Partial<Job> = {}): Job[] {
  return Array.from({ length: count }, (_, index) =>
    createJob({
      id: `job-${index + 1}`,
      jobName: `Test Job ${index + 1}`,
      ...baseOverrides,
    }),
  )
}

export function createJobWithProgress(overrides: Partial<Job> = {}): Job {
  return createJob({
    status: 'processing',
    currentStep: 'analyze',
    totalChunks: 10,
    processedChunks: 5,
    totalEpisodes: 3,
    processedEpisodes: 1,
    totalPages: 15,
    renderedPages: 8,
    processingEpisode: 2,
    processingPage: 3,
    ...overrides,
  })
}

export function createCompletedJob(overrides: Partial<Job> = {}): Job {
  return createJob({
    status: 'completed',
    currentStep: 'completed',
    splitCompleted: true,
    analyzeCompleted: true,
    episodeCompleted: true,
    layoutCompleted: true,
    renderCompleted: true,
    totalChunks: 10,
    processedChunks: 10,
    totalEpisodes: 3,
    processedEpisodes: 3,
    totalPages: 15,
    renderedPages: 15,
    completedAt: new Date().toISOString(),
    ...overrides,
  })
}

export function createFailedJob(overrides: Partial<Job> = {}): Job {
  return createJob({
    status: 'failed',
    currentStep: 'analyze',
    lastError: 'Test error message',
    lastErrorStep: 'analyze',
    retryCount: 3,
    ...overrides,
  })
}

export const DatabaseMockFactory = {
  createUser,
  createNovel,
  createJob,
  createEpisode,
  createChunk,
  createLayoutStatus,
  createRenderStatus,
  createOutput,
  createCompleteWorkflow,
  createUsers,
  createJobs,
  createJobWithProgress,
  createCompletedJob,
  createFailedJob,
}
