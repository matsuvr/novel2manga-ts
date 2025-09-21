/**
 * Background Job Processing Worker
 * Implements configurable job queue processing with status updates
 */
import { and, eq, lt, or } from 'drizzle-orm'
import { getDatabase } from '@/db'
import { jobs } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'

export interface JobWorkerConfig {
  tickIntervalMs: number
  maxRetries: number
  enableNotifications: boolean
  batchSize: number
}

export interface JobProcessingResult {
  success: boolean
  error?: string
  nextStep?: string
}

/**
 * Job Worker Class with configurable tick interval
 * Processes jobs from the queue and integrates with existing job processing pipeline
 */
export class JobWorker {
  private readonly config: JobWorkerConfig
  private readonly logger = getLogger().withContext({ service: 'job-worker' })
  private isRunning = false
  private intervalId: NodeJS.Timeout | null = null
  private shutdownPromise: Promise<void> | null = null

  constructor(config: Partial<JobWorkerConfig> = {}) {
    this.config = {
      tickIntervalMs: Number(process.env.WORKER_TICK_MS) || 5000,
      maxRetries: Number(process.env.WORKER_MAX_RETRIES) || 3,
      // Important: Default to false to avoid duplicate notifications.
      // Enable explicitly via env only when the worker is the sole orchestrator.
      enableNotifications: process.env.WORKER_ENABLE_NOTIFICATIONS === 'true',
      batchSize: Number(process.env.WORKER_BATCH_SIZE) || 1,
      ...config,
    }

    this.logger.info('JobWorker initialized', { config: this.config })
  }

  /**
   * Start the job processing worker
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Worker is already running')
      return
    }

    this.isRunning = true
    this.logger.info('Starting job worker', {
      tickInterval: this.config.tickIntervalMs,
      batchSize: this.config.batchSize,
    })

    // Start the processing loop
    this.intervalId = setInterval(() => {
      this.processJobBatch().catch((error) => {
        this.logger.error('Error in job processing batch', {
          error: error instanceof Error ? error.message : String(error),
        })
      })
    }, this.config.tickIntervalMs)

    // Setup graceful shutdown handlers
    process.on('SIGTERM', () => this.gracefulShutdown())
    process.on('SIGINT', () => this.gracefulShutdown())

    this.logger.info('Job worker started successfully')
  }

  /**
   * Stop the job processing worker
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    this.logger.info('Stopping job worker...')
    this.isRunning = false

    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }

    // Wait for any ongoing processing to complete
    if (this.shutdownPromise) {
      await this.shutdownPromise
    }

    this.logger.info('Job worker stopped')
  }

  /**
   * Process a batch of pending jobs
   */
  private async processJobBatch(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    try {
      const db = getDatabase()

      // Get pending jobs not currently leased (or lease expired)
      const pendingJobs = await db
        .select({
          id: jobs.id,
          novelId: jobs.novelId,
          userId: jobs.userId,
          status: jobs.status,
          currentStep: jobs.currentStep,
          retryCount: jobs.retryCount,
          lastError: jobs.lastError,
          jobName: jobs.jobName,
        })
        .from(jobs)
        .where(
          and(
            eq(jobs.status, 'pending'),
            // not locked or lease expired
            or(eq(jobs.lockedBy, null as unknown as string), lt(jobs.leaseExpiresAt, new Date().toISOString())),
          ),
        )
        .limit(this.config.batchSize)

      if (pendingJobs.length === 0) {
        return
      }

      this.logger.info('Processing job batch', {
        jobCount: pendingJobs.length,
        jobIds: pendingJobs.map((j) => j.id),
      })

      // Process jobs sequentially to avoid resource conflicts
      for (const job of pendingJobs) {
        if (!this.isRunning) {
          break
        }

        // Check retry count
        const retryCount = job.retryCount || 0
        if (retryCount >= this.config.maxRetries) {
          await this.markJobAsFailed(
            job.id,
            `Maximum retry count (${this.config.maxRetries}) exceeded`,
          )
          continue
        }

        // Try to lease the job to avoid concurrent processing
        try {
          const { db: services } = await import('@/services/database')
          const workerId = `worker-${process.pid}`
          const leased = await services.jobs().leaseJob?.(job.id, workerId)
          if (!leased) {
            this.logger.info('Job lease failed, skipping', { jobId: job.id })
            continue
          }
        } catch {
          // If lease API not available, proceed (best-effort)
        }

        await this.processJob(job)
      }
    } catch (error) {
      this.logger.error('Error processing job batch', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: {
    id: string
    novelId: string
    userId: string
    status: string
    currentStep: string
    retryCount: number | null
    lastError: string | null
    jobName: string | null
  }): Promise<void> {
    const startTime = Date.now()

    try {
      this.logger.info('Starting job processing', {
        jobId: job.id,
        userId: job.userId,
        currentStep: job.currentStep,
        retryCount: job.retryCount,
      })

      // Update job status to processing
      await this.updateJobStatus(job.id, 'processing', null, new Date().toISOString())

      // Process the job based on current step
      const result = await this.executeJobStep(job)

      if (result.success) {
        if (result.nextStep) {
          // Move to next step
          await this.updateJobStep(job.id, result.nextStep, 'pending')
          this.logger.info('Job step completed, moving to next step', {
            jobId: job.id,
            completedStep: job.currentStep,
            nextStep: result.nextStep,
          })
        } else {
          // Job completed
          await this.markJobAsCompleted(job.id)
          this.logger.info('Job completed successfully', {
            jobId: job.id,
            duration: Date.now() - startTime,
          })
        }
      } else {
        // Job step failed
        await this.handleJobFailure(job.id, result.error || 'Unknown error')
        this.logger.error('Job step failed', {
          jobId: job.id,
          step: job.currentStep,
          error: result.error,
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      await this.handleJobFailure(job.id, errorMessage)

      this.logger.error('Unexpected error processing job', {
        jobId: job.id,
        error: errorMessage,
        duration: Date.now() - startTime,
      })
    }
  }

  /**
   * Execute a specific job step
   * This integrates with the existing job processing pipeline
   */
  private async executeJobStep(job: {
    id: string
    novelId: string
    userId: string
    currentStep: string
    jobName: string | null
  }): Promise<JobProcessingResult> {
    try {
      // TODO: Integrate with existing job processing pipeline
      // This is where you would call the existing job processing logic
      // For now, we'll simulate the processing steps

      switch (job.currentStep) {
        case 'split':
          // TODO: Call existing text splitting logic
          await this.simulateProcessing('split', 2000)
          return { success: true, nextStep: 'analyze' }

        case 'analyze':
          // TODO: Call existing analysis logic
          await this.simulateProcessing('analyze', 3000)
          return { success: true, nextStep: 'episode' }

        case 'episode':
          // TODO: Call existing episode generation logic
          await this.simulateProcessing('episode', 4000)
          return { success: true, nextStep: 'layout' }

        case 'layout':
          // TODO: Call existing layout generation logic
          await this.simulateProcessing('layout', 5000)
          return { success: true, nextStep: 'render' }

        case 'render':
          // TODO: Call existing rendering logic
          await this.simulateProcessing('render', 6000)
          return { success: true } // No next step, job completed

        default:
          return {
            success: false,
            error: `Unknown job step: ${job.currentStep}`,
          }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Simulate processing for development/testing
   * TODO: Replace with actual job processing integration
   */
  private async simulateProcessing(step: string, durationMs: number): Promise<void> {
    this.logger.debug('Simulating job step processing', { step, durationMs })

    // Simulate some processing time
    await new Promise((resolve) => setTimeout(resolve, durationMs))

    // Simulate occasional failures for testing
    if (Math.random() < 0.1) {
      // 10% failure rate
      throw new Error(`Simulated failure in ${step} step`)
    }
  }

  /**
   * Update job status in database
   */
  private async updateJobStatus(
    jobId: string,
    status: string,
    error: string | null = null,
    startedAt?: string,
  ): Promise<void> {
    const db = getDatabase()

    const updateData: {
      status: string
      updatedAt: string
      lastError?: string | null
      startedAt?: string
    } = {
      status,
      updatedAt: new Date().toISOString(),
    }

    if (error !== null) {
      updateData.lastError = error
    }

    if (startedAt) {
      updateData.startedAt = startedAt
    }

    await db.update(jobs).set(updateData).where(eq(jobs.id, jobId))
  }

  /**
   * Update job step
   */
  private async updateJobStep(jobId: string, step: string, status: string): Promise<void> {
    const db = getDatabase()

    await db
      .update(jobs)
      .set({
        currentStep: step,
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId))
  }

  /**
   * Mark job as completed
   */
  private async markJobAsCompleted(jobId: string): Promise<void> {
    const db = getDatabase()

    await db
      .update(jobs)
      .set({
        status: 'completed',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: null,
      })
      .where(eq(jobs.id, jobId))

    // Release lease
    try {
      const { db: services } = await import('@/services/database')
      await services.jobs().releaseLease?.(jobId)
    } catch (e) {
      this.logger.warn('release_lease_failed_on_complete', {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // Notification is centralized in the application pipeline (BasePipelineStep ->
    // updateJobStatusWithNotification). Worker does not send email directly to
    // avoid duplicate notifications when both orchestrators run.
  }

  /**
   * Mark job as failed
   */
  private async markJobAsFailed(jobId: string, error: string): Promise<void> {
    const db = getDatabase()

    await db
      .update(jobs)
      .set({
        status: 'failed',
        lastError: error,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(jobs.id, jobId))

    // Release lease
    try {
      const { db: services } = await import('@/services/database')
      await services.jobs().releaseLease?.(jobId)
    } catch (e) {
      this.logger.warn('release_lease_failed_on_fail', {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // Notification is centralized in the application pipeline. Do not send here.
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(jobId: string, error: string): Promise<void> {
    const db = getDatabase()

    // Get current retry count
    const [currentJob] = await db
      .select({ retryCount: jobs.retryCount })
      .from(jobs)
      .where(eq(jobs.id, jobId))

    const retryCount = (currentJob?.retryCount || 0) + 1

    if (retryCount < this.config.maxRetries) {
      // Increment retry count and set back to pending for retry
      await db
        .update(jobs)
        .set({
          status: 'pending',
          retryCount,
          lastError: error,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId))

      this.logger.info('Job scheduled for retry', {
        jobId,
        retryCount,
        maxRetries: this.config.maxRetries,
      })
    } else {
      // Max retries exceeded, mark as failed
      await this.markJobAsFailed(jobId, `Max retries exceeded. Last error: ${error}`)
    }
  }

  // Notification sending is intentionally not implemented here. The
  // application pipeline is the single source of truth for user-facing
  // notifications on job status transitions.

  /**
   * Graceful shutdown handler
   */
  private gracefulShutdown(): void {
    this.logger.info('Received shutdown signal, initiating graceful shutdown...')

    this.shutdownPromise = this.stop()
      .then(() => {
        this.logger.info('Graceful shutdown completed')
        process.exit(0)
      })
      .catch((error) => {
        this.logger.error('Error during graceful shutdown', {
          error: error instanceof Error ? error.message : String(error),
        })
        process.exit(1)
      })
  }

  /**
   * Get worker status
   */
  getStatus(): { isRunning: boolean; config: JobWorkerConfig } {
    return {
      isRunning: this.isRunning,
      config: this.config,
    }
  }
}

// Export singleton instance for easy use
// Export a lazily-created singleton. This avoids instantiating the worker at module
// import time which can cause side-effects (timers, DB access) during SSR or tests.
let _jobWorker: JobWorker | null = null

export function getJobWorker(config: Partial<JobWorkerConfig> = {}): JobWorker {
  if (!_jobWorker) {
    _jobWorker = new JobWorker(config)
  }
  return _jobWorker
}
