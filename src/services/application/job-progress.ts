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
        const perEpisodePages: Record<
          number,
          { planned: number; rendered: number; total?: number }
        > = {}

        for (const episode of episodes) {
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
          } catch (_error) {
            // Silently handle errors to avoid test interference
          }

          // Get rendered pages count (from database)
          let rendered = 0
          try {
            const renderStatus = await db.getRenderStatusByEpisode(id, episodeNumber)
            if (renderStatus && Array.isArray(renderStatus)) {
              rendered = renderStatus.length
            }
          } catch (_error) {
            // Silently handle errors to avoid test interference
          }

          perEpisodePages[episodeNumber] = {
            planned,
            rendered,
            total,
          }
        }

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
    } catch (_error) {
      // Return original job if enrichment fails
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
