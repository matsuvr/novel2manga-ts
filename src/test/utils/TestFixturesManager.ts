/**
 * Test Fixtures Manager
 *
 * Provides consistent test data creation and management for all test types.
 * Supports creating individual entities and complete workflow scenarios.
 */

import type {
  Chunk,
  ChunkAnalysisStatus,
  Episode,
  Job,
  LayoutStatus,
  Novel,
  Output,
  RenderStatus,
  User,
} from '@/db'

export interface TestFixtures {
  users?: User[]
  novels?: Novel[]
  jobs?: Job[]
  episodes?: Episode[]
  chunks?: Chunk[]
  outputs?: Output[]
  layoutStatus?: LayoutStatus[]
  renderStatus?: RenderStatus[]
  chunkAnalysisStatus?: ChunkAnalysisStatus[]
}

export interface WorkflowFixtures {
  user: User
  novel: Novel
  job: Job
  episodes: Episode[]
  chunks: Chunk[]
  outputs: Output[]
}

export class TestFixturesManager {
  private static instance: TestFixturesManager | null = null

  private constructor() {}

  static getInstance(): TestFixturesManager {
    if (!TestFixturesManager.instance) {
      TestFixturesManager.instance = new TestFixturesManager()
    }
    return TestFixturesManager.instance
  }

  /**
   * Create a test user with optional overrides
   */
  createUser(overrides: Partial<User> = {}): User {
    const timestamp = new Date().toISOString()
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    return {
      id: `user-${uniqueId}`,
      name: 'Test User',
      email: `test-${uniqueId}@example.com`,
      emailVerified: null,
      image: null,
      createdAt: timestamp,
      // For test fixtures we return numeric flags (0/1) to match legacy DB shapes
      emailNotifications: 1 as unknown as boolean,
      theme: 'light',
      language: 'ja',
      ...overrides,
    }
  }

  /**
   * Create a test novel with optional overrides
   */
  createNovel(userId: string, overrides: Partial<Novel> = {}): Novel {
    const timestamp = new Date().toISOString()
    return {
      id: `novel-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      title: 'Test Novel',
      author: 'Test Author',
      originalTextPath: '/test/path/novel.txt',
      textLength: 10000,
      language: 'ja',
      metadataPath: '/test/path/metadata.json',
      userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    }
  }

  /**
   * Create a test job with optional overrides
   */
  createJob(novelId: string, userId: string, overrides: Partial<Job> = {}): Job {
    const timestamp = new Date().toISOString()

    return {
      id: `job-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      novelId,
      jobName: 'Test Job',
      userId,
      status: 'pending',
      currentStep: 'initialized',
      splitCompleted: false,
      analyzeCompleted: false,
      episodeCompleted: false,
      layoutCompleted: false,
      renderCompleted: false,
      chunksDirPath: '/test/chunks',
      analysesDirPath: '/test/analyses',
      episodesDataPath: '/test/episodes.json',
      layoutsDirPath: '/test/layouts',
      rendersDirPath: '/test/renders',
      characterMemoryPath: '/test/character-memory.json',
      promptMemoryPath: '/test/prompt-memory.json',
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
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
      ...overrides,
    }
  }

  /**
   * Create a test episode with optional overrides
   */
  createEpisode(
    novelId: string,
    jobId: string,
    episodeNumber: number,
    overrides: Partial<Episode> = {},
  ): Episode {
    const timestamp = new Date().toISOString()
    return {
      id: `episode-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      novelId,
      jobId,
      episodeNumber,
      title: `Episode ${episodeNumber}`,
      summary: `Summary for episode ${episodeNumber}`,
      startChunk: episodeNumber - 1,
      startCharIndex: (episodeNumber - 1) * 1000,
      endChunk: episodeNumber,
      endCharIndex: episodeNumber * 1000,
      confidence: 0.95,
      createdAt: timestamp,
      episodeTextPath: `/test/episodes/episode-${episodeNumber}.txt`,
      ...overrides,
    }
  }

  /**
   * Create a test chunk with optional overrides
   */
  createChunk(
    novelId: string,
    jobId: string,
    chunkIndex: number,
    overrides: Partial<Chunk> = {},
  ): Chunk {
    const timestamp = new Date().toISOString()
    return {
      id: `chunk-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      novelId,
      jobId,
      chunkIndex,
      contentPath: `/test/chunks/chunk-${chunkIndex}.txt`,
      startPosition: chunkIndex * 1000,
      endPosition: (chunkIndex + 1) * 1000,
      wordCount: 500,
      createdAt: timestamp,
      ...overrides,
    }
  }

  /**
   * Create a test output with optional overrides
   */
  createOutput(
    novelId: string,
    jobId: string,
    userId: string,
    overrides: Partial<Output> = {},
  ): Output {
    const timestamp = new Date().toISOString()
    return {
      id: `output-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      novelId,
      jobId,
      outputType: 'manga',
      outputPath: '/test/output/manga.pdf',
      fileSize: 1024000,
      pageCount: 20,
      metadataPath: '/test/output/metadata.json',
      createdAt: timestamp,
      userId,
      ...overrides,
    }
  }

  /**
   * Create layout status with optional overrides
   */
  createLayoutStatus(
    jobId: string,
    episodeNumber: number,
    overrides: Partial<LayoutStatus> = {},
  ): LayoutStatus {
    const timestamp = new Date().toISOString()
    return {
      id: `layout-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      jobId,
      episodeNumber,
      isGenerated: 0 as unknown as boolean,
      layoutPath: null,
      totalPages: null,
      totalPanels: null,
      generatedAt: null,
      retryCount: 0,
      lastError: null,
      createdAt: timestamp,
      ...overrides,
    }
  }

  /**
   * Create render status with optional overrides
   */
  createRenderStatus(
    jobId: string,
    episodeNumber: number,
    pageNumber: number,
    overrides: Partial<RenderStatus> = {},
  ): RenderStatus {
    const timestamp = new Date().toISOString()
    return {
      id: `render-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      jobId,
      episodeNumber,
      pageNumber,
      isRendered: 0 as unknown as boolean,
      imagePath: null,
      thumbnailPath: null,
      width: null,
      height: null,
      fileSize: null,
      renderedAt: null,
      retryCount: 0,
      lastError: null,
      createdAt: timestamp,
      ...overrides,
    }
  }

  /**
   * Create chunk analysis status with optional overrides
   */
  createChunkAnalysisStatus(
    jobId: string,
    chunkIndex: number,
    overrides: Partial<ChunkAnalysisStatus> = {},
  ): ChunkAnalysisStatus {
    const timestamp = new Date().toISOString()
    return {
      id: `analysis-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      jobId,
      chunkIndex,
      isAnalyzed: 0 as unknown as boolean,
      analysisPath: null,
      analyzedAt: null,
      retryCount: 0,
      lastError: null,
      createdAt: timestamp,
      ...overrides,
    }
  }

  /**
   * Create a complete workflow scenario with all related entities
   */
  setupCompleteWorkflow(
    overrides: {
      user?: Partial<User>
      novel?: Partial<Novel>
      job?: Partial<Job>
      episodeCount?: number
      chunkCount?: number
    } = {},
  ): WorkflowFixtures {
    const {
      user: userOverrides = {},
      novel: novelOverrides = {},
      job: jobOverrides = {},
      episodeCount = 3,
      chunkCount = 5,
    } = overrides

    // Create user
    const user = this.createUser(userOverrides)

    // Create novel
    const novel = this.createNovel(user.id, novelOverrides)

    // Create job
    const job = this.createJob(novel.id, user.id, {
      totalEpisodes: episodeCount,
      totalChunks: chunkCount,
      ...jobOverrides,
    })

    // Create episodes
    const episodes: Episode[] = []
    for (let i = 1; i <= episodeCount; i++) {
      episodes.push(this.createEpisode(novel.id, job.id, i))
    }

    // Create chunks
    const chunks: Chunk[] = []
    for (let i = 0; i < chunkCount; i++) {
      chunks.push(this.createChunk(novel.id, job.id, i))
    }

    // Create output
    const outputs = [this.createOutput(novel.id, job.id, user.id)]

    return {
      user,
      novel,
      job,
      episodes,
      chunks,
      outputs,
    }
  }

  /**
   * Create test fixtures for a specific scenario
   */
  createTestFixtures(scenario: 'minimal' | 'complete' | 'workflow' | 'error'): TestFixtures {
    switch (scenario) {
      case 'minimal':
        return {
          users: [this.createUser()],
        }

      case 'complete': {
        const user = this.createUser()
        const novel = this.createNovel(user.id)
        const job = this.createJob(novel.id, user.id)

        return {
          users: [user],
          novels: [novel],
          jobs: [job],
          episodes: [this.createEpisode(novel.id, job.id, 1)],
          chunks: [this.createChunk(novel.id, job.id, 0)],
          outputs: [this.createOutput(novel.id, job.id, user.id)],
        }
      }

      case 'workflow': {
        const workflow = this.setupCompleteWorkflow()
        return {
          users: [workflow.user],
          novels: [workflow.novel],
          jobs: [workflow.job],
          episodes: workflow.episodes,
          chunks: workflow.chunks,
          outputs: workflow.outputs,
        }
      }

      case 'error': {
        return this.createErrorScenarioFixtures()
      }

      default:
        throw new Error(`Unknown scenario: ${scenario}`)
    }
  }

  /**
   * Create fixtures for testing error scenarios
   */
  createErrorScenarioFixtures(): TestFixtures {
    const user = this.createUser()
    const novel = this.createNovel(user.id)
    const job = this.createJob(novel.id, user.id, {
      status: 'failed',
      lastError: 'Test error message',
      lastErrorStep: 'analyze',
      retryCount: 3,
    })

    return {
      users: [user],
      novels: [novel],
      jobs: [job],
    }
  }

  /**
   * Create fixtures for testing processing states
   */
  createProcessingStateFixtures(): TestFixtures {
    const user = this.createUser()
    const novel = this.createNovel(user.id)
    const job = this.createJob(novel.id, user.id, {
      status: 'processing',
      currentStep: 'render',
      totalEpisodes: 2,
      processedEpisodes: 1,
      totalPages: 10,
      renderedPages: 5,
      processingEpisode: 2,
      processingPage: 6,
    })

    const episodes = [
      this.createEpisode(novel.id, job.id, 1),
      this.createEpisode(novel.id, job.id, 2),
    ]

    const layoutStatus = [
      // Use numeric flags (1/0) to match legacy DB shapes and test expectations
      this.createLayoutStatus(job.id, 1, { isGenerated: 1 as unknown as boolean, totalPages: 5 }),
      this.createLayoutStatus(job.id, 2, { isGenerated: 0 as unknown as boolean }),
    ]

    const renderStatus = [
      // Use numeric flags (1/0) rather than booleans
      this.createRenderStatus(job.id, 1, 1, { isRendered: 1 as unknown as boolean }),
      this.createRenderStatus(job.id, 1, 2, { isRendered: 1 as unknown as boolean }),
      this.createRenderStatus(job.id, 2, 1, { isRendered: 0 as unknown as boolean }),
    ]

    return {
      users: [user],
      novels: [novel],
      jobs: [job],
      episodes,
      layoutStatus,
      renderStatus,
    }
  }
}

// Export singleton instance
export const testFixturesManager = TestFixturesManager.getInstance()
