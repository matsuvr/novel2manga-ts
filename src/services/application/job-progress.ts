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
          const total = episode.estimatedPages || 0

          // Get planned pages from layout progress
          let planned = 0
          try {
            const layoutProgress = await layout.getEpisodeLayoutProgress(id, episodeNumber)
            if (layoutProgress) {
              const parsedProgress = JSON.parse(layoutProgress)
              if (parsedProgress.pages && Array.isArray(parsedProgress.pages)) {
                planned = parsedProgress.pages.length
              }
            }
          } catch (error) {
            // NEVER SILENCE ERRORS - Always log with full context for debugging
            const { getLogger } = await import('@/infrastructure/logging/logger')
            const logger = getLogger().withContext({
              service: 'JobProgressService',
              method: 'getJobWithProgress',
              operation: 'getEpisodeLayoutProgress',
            })
            logger.error('Failed to get episode layout progress', {
              jobId: id,
              episodeNumber,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
            // Set planned to 0 but continue processing other episodes
            planned = 0
          }

          // Get rendered pages count (from database)
          let rendered = 0
          try {
            const renderStatus = await db.getRenderStatusByEpisode(id, episodeNumber)
            if (renderStatus && Array.isArray(renderStatus)) {
              rendered = renderStatus.length
            }
          } catch (error) {
            // NEVER SILENCE ERRORS - Always log with full context for debugging
            const { getLogger } = await import('@/infrastructure/logging/logger')
            const logger = getLogger().withContext({
              service: 'JobProgressService',
              method: 'getJobWithProgress',
              operation: 'getRenderStatusByEpisode',
            })
            logger.error('Failed to get episode render status', {
              jobId: id,
              episodeNumber,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            })
            // Set rendered to 0 but continue processing other episodes
            rendered = 0
          }

          return [
            episodeNumber,
            {
              planned,
              rendered,
              total,
            },
          ] as const
        })

        // Wait for all episode processing to complete
        const perEpisodePagesEntries = await Promise.all(perEpisodePagesPromises)
        const perEpisodePages: Record<
          number,
          { planned: number; rendered: number; total?: number }
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
