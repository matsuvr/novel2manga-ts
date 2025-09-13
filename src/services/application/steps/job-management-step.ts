import type { Job } from '@/db/schema'
import { db } from '@/services/database'
import { generateUUID } from '@/utils/uuid'
import { BasePipelineStep, type StepContext, type StepExecutionResult } from './base-step'

export interface JobManagementOptions {
  title?: string
  existingJobId?: string
}

export interface JobInitResult {
  jobId: string
  isResumed: boolean
  existingJob?: Job
}

/**
 * Step responsible for job creation, status management, and resume logic
 */
export class JobManagementStep extends BasePipelineStep {
  readonly stepName = 'job-management'

  /**
   * Initialize or resume a job
   */
  async initializeJob(
    novelId: string,
    options: JobManagementOptions,
    context: Pick<StepContext, 'logger'>,
  ): Promise<StepExecutionResult<JobInitResult>> {
    const { logger } = context
    const jobDb = db.jobs()

    try {
      // 既存の jobId が指定されていればそれを使用。なければ新規発行
      const jobId = options.existingJobId ?? generateUUID()
      const title = options.title || 'Novel'
      let isResumed = false
      let existingJob: Job | null = null

      // Check if this is a resumed job
      if (options.existingJobId) {
        existingJob = await jobDb.getJob(options.existingJobId)
        if (!existingJob) {
          return {
            success: false,
            error: `Cannot resume: job ${options.existingJobId} not found`,
          }
        }
        isResumed = true
        logger.info('Job resume status check', {
          jobId,
          splitCompleted: existingJob.splitCompleted,
          analyzeCompleted: existingJob.analyzeCompleted,
          episodeCompleted: existingJob.episodeCompleted,
        })
      }

      // Create new job if not resuming
      if (!options.existingJobId) {
        // ここで「DBにジョブレコードを作成（書き込み）」
        //   - novelId を外部キーに持つ
        jobDb.createJobRecord({ id: jobId, novelId, title: `Analysis Job for ${title}` })
        logger.info('New job created', { jobId, novelId, title })
      }

      return {
        success: true,
        data: {
          jobId,
          isResumed,
          existingJob: existingJob || undefined,
        },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to initialize job', {
        novelId,
        existingJobId: options.existingJobId,
        error: errorMessage,
      })
      return { success: false, error: errorMessage }
    }
  }
}
