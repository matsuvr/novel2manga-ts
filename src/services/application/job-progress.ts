import { getStoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { JobProgress, JobStatus } from '@/types/job'

export class JobProgressService {
  private readonly jobRepo: JobRepository

  constructor() {
    const db = getDatabaseService()
    const { job } = adaptAll(db)
    this.jobRepo = new JobRepository(job)
  }

  /**
   * Type guard for layout progress data
   */
  private isValidLayoutProgress(data: unknown): data is { pages: unknown[] } {
    return (
      typeof data === 'object' &&
      data !== null &&
      'pages' in data &&
      Array.isArray((data as Record<string, unknown>).pages)
    )
  }

  /**
   * Safely execute an operation with proper error logging
   */
  private async safeOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    context: { jobId: string; episodeNumber?: number },
  ): Promise<T | null> {
    try {
      return await operation()
    } catch (error) {
      // NEVER SILENCE ERRORS - Always log with full context for debugging
      const { getLogger } = await import('@/infrastructure/logging/logger')
      const logger = getLogger().withContext({
        service: 'JobProgressService',
        method: 'getJobWithProgress',
        operation: operationName,
      })
      logger.error(`Failed to execute ${operationName}`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      return null
    }
  }

  /**
   * Parse layout progress with type safety
   */
  private parseLayoutProgress(layoutProgressJson: string): number {
    try {
      const parsedProgress = JSON.parse(layoutProgressJson)
      if (this.isValidLayoutProgress(parsedProgress)) {
        return parsedProgress.pages.length
      }
      return 0
    } catch (error) {
      // JSON parse error - log with structured logger and return 0
      // Use async import to avoid circular dependencies
      import('@/infrastructure/logging/logger')
        .then(({ getLogger }) => {
          const logger = getLogger().withContext({
            service: 'JobProgressService',
            method: 'parseLayoutProgress',
            operation: 'JSON.parse',
          })
          logger.error('Failed to parse layout progress JSON', {
            json: layoutProgressJson,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        })
        .catch(() => {
          // Fallback to console if logger fails
          console.error('Failed to parse layout progress JSON', {
            json: layoutProgressJson,
            error: error instanceof Error ? error.message : String(error),
          })
        })
      return 0
    }
  }

  private parseLayoutValidation(layoutProgressJson: string): {
    normalizedPages: number[]
    pagesWithIssueCounts: Record<number, number>
    issuesCount: number
  } {
    try {
      const parsed = JSON.parse(layoutProgressJson) as {
        validation?: {
          normalizedPages?: number[]
          pagesWithIssueCounts?: Record<string, number> | Record<number, number>
          pageIssues?: Record<string, unknown[]>
        }
      }
      const normalizedPages: number[] = Array.isArray(parsed.validation?.normalizedPages)
        ? (parsed.validation?.normalizedPages as number[])
        : []
      const rawCounts = parsed.validation?.pagesWithIssueCounts ?? {}
      const pagesWithIssueCounts: Record<number, number> = Object.fromEntries(
        Object.entries(rawCounts).map(([k, v]) => [Number(k), Number(v)]),
      )
      // Derive issuesCount (sum of page issue counts)
      let issuesCount = 0
      if (parsed.validation?.pageIssues && typeof parsed.validation.pageIssues === 'object') {
        for (const v of Object.values(parsed.validation.pageIssues)) {
          if (Array.isArray(v)) issuesCount += v.length
        }
      } else {
        issuesCount = Object.values(pagesWithIssueCounts).reduce((a, b) => a + (Number(b) || 0), 0)
      }
      return { normalizedPages, pagesWithIssueCounts, issuesCount }
    } catch {
      return { normalizedPages: [], pagesWithIssueCounts: {}, issuesCount: 0 }
    }
  }

  async getJobWithProgress(id: string) {
    const job = await this.jobRepo.getJobWithProgress(id)
    if (!job) {
      return null
    }

    // Enrich with perEpisodePages data
    try {
      const db = getDatabaseService()
      const episodes = await db.getEpisodesByJobId(id)
      const { layout } = getStoragePorts()

      if (episodes && episodes.length > 0) {
        // Process episodes in parallel for better performance
        const perEpisodePagesPromises = episodes.map(async (episode) => {
          const episodeNumber = episode.episodeNumber
          // Get actual pages from layout progress
          const layoutProgress = await this.safeOperation(
            () => layout.getEpisodeLayoutProgress(id, episodeNumber),
            'getEpisodeLayoutProgress',
            { jobId: id, episodeNumber },
          )

          const actualPages = layoutProgress ? this.parseLayoutProgress(layoutProgress) : 0
          const validation = layoutProgress
            ? this.parseLayoutValidation(layoutProgress)
            : { normalizedPages: [], pagesWithIssueCounts: {}, issuesCount: 0 }

          // Get rendered pages count (from database)
          const renderStatus = await this.safeOperation(
            () => db.getRenderStatusByEpisode(id, episodeNumber),
            'getRenderStatusByEpisode',
            { jobId: id, episodeNumber },
          )

          const rendered = renderStatus && Array.isArray(renderStatus) ? renderStatus.length : 0

          return [
            episodeNumber,
            {
              actualPages,
              rendered,
              validation,
            },
          ] as const
        })

        // Wait for all episode processing to complete
        const perEpisodePagesEntries = await Promise.all(perEpisodePagesPromises)
        const perEpisodePages: Record<
          number,
          {
            actualPages: number
            rendered: number
            validation: {
              normalizedPages: number[]
              pagesWithIssueCounts: Record<number, number>
              issuesCount: number
            }
          }
        > = Object.fromEntries(perEpisodePagesEntries)

        // Only enrich if we have episode data
        if (Object.keys(perEpisodePages).length > 0) {
          // Merge perEpisodePages into job progress
          const enrichedJob = {
            ...job,
            progress: {
              ...job.progress,
              perEpisodePages,
            },
          }

          return enrichedJob
        }
      }
    } catch (error) {
      // NEVER SILENCE ERRORS - Always log the error with full context
      const { getLogger } = await import('@/infrastructure/logging/logger')
      const logger = getLogger().withContext({
        service: 'JobProgressService',
        method: 'getJobWithProgress',
        operation: 'enrichWithPerEpisodePages',
      })
      logger.error('Failed to enrich job with episode progress data', {
        jobId: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Return original job if enrichment fails completely
    }

    return job
  }

  async updateStatus(id: string, status: JobStatus, error?: string): Promise<void> {
    await this.jobRepo.updateStatus(id, status, error)
  }

  async updateStep(
    id: string,
    currentStep: Parameters<JobRepository['updateStep']>[1],
    processedChunks?: number,
    totalChunks?: number,
    error?: string,
    errorStep?: string,
  ): Promise<void> {
    await this.jobRepo.updateStep(id, currentStep, processedChunks, totalChunks, error, errorStep)
  }

  async markStepCompleted(
    id: string,
    step: Parameters<JobRepository['markStepCompleted']>[1],
  ): Promise<void> {
    await this.jobRepo.markStepCompleted(id, step)
  }

  async updateProgress(id: string, progress: JobProgress): Promise<void> {
    await this.jobRepo.updateProgress(id, progress)
  }

  async updateError(
    id: string,
    error: string,
    step: string,
    incrementRetry: boolean = true,
  ): Promise<void> {
    await this.jobRepo.updateError(id, error, step, incrementRetry)
  }
}
