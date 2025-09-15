import type { LoggerPort } from '@/infrastructure/logging/logger'
import type { StoragePorts } from '@/infrastructure/storage/ports'
import { db } from '@/services/database'
import type { JobStatus, JobStep } from '@/types/job'

/**
 * Base interface for all pipeline steps
 */
export interface PipelineStep {
  readonly stepName: string
}

/**
 * Common context passed to all pipeline steps
 */
export interface StepContext {
  jobId: string
  novelId: string
  logger: LoggerPort
  ports: StoragePorts
  isDemo?: boolean
}

/**
 * Base execution context for operations that don't need full step context
 */
export interface ExecutionContext {
  logger: LoggerPort
}

/**
 * Result returned by pipeline steps
 */
export interface StepResult<TData = unknown> {
  success: true
  data: TData
  message?: string
}

/**
 * Error result from pipeline steps
 */
export interface StepError {
  success: false
  error: string
  details?: unknown
}

export type StepExecutionResult<TData = unknown> = StepResult<TData> | StepError

/**
 * Base abstract class for all pipeline steps
 * Provides common functionality for DB access, job management, and error handling
 */
export abstract class BasePipelineStep implements PipelineStep {
  abstract readonly stepName: string

  protected createSuccess<T>(data: T, message?: string): StepResult<T> {
    return { success: true, data, message }
  }

  protected createError(error: string, details?: unknown): StepError {
    return { success: false, error, details }
  }

  protected async executeWithJobErrorHandling<T>(
    context: StepContext,
    operation: () => Promise<StepExecutionResult<T>>,
    operationName: string,
  ): Promise<StepExecutionResult<T>> {
    try {
      return await operation()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logStructuredError(context, operationName, error)

      // Update job status to failed
      try {
        await this.updateJobStatus(
          context.jobId,
          'failed',
          { logger: context.logger },
          errorMessage,
        )
      } catch (statusError) {
        context.logger.error(`Failed to update job status after ${operationName} failure`, {
          jobId: context.jobId,
          originalError: errorMessage,
          statusError: statusError instanceof Error ? statusError.message : String(statusError),
        })
      }

      return this.createError(errorMessage)
    }
  }

  // Common job management operations
  protected async updateJobStatus(
    jobId: string,
    status: JobStatus,
    context: ExecutionContext,
    errorMessage?: string,
  ): Promise<void> {
    try {
      const { updateJobStatusWithNotification } = await import(
        '@/services/notification/integration'
      )
      const jobs = db.jobs()
      await updateJobStatusWithNotification(
        jobs.updateJobStatus.bind(jobs),
        jobId,
        status,
        errorMessage,
      )
      context.logger.info('Job status updated', { jobId, status, errorMessage })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.logger.error('Failed to update job status', { jobId, status, error: message })
      throw error
    }
  }

  protected async markStepCompleted(
    jobId: string,
    step: JobStep,
    context: ExecutionContext,
  ): Promise<void> {
    try {
      const jobDb = db.jobs()
      // Only certain steps can be marked as completed in the repository
      const completableSteps: Array<'split' | 'analyze' | 'episode' | 'layout' | 'render'> = [
        'split',
        'analyze',
        'episode',
        'layout',
        'render',
      ]

      if (
        completableSteps.includes(step as 'split' | 'analyze' | 'episode' | 'layout' | 'render')
      ) {
        jobDb.markJobStepCompleted(
          jobId,
          step as 'split' | 'analyze' | 'episode' | 'layout' | 'render',
        )
        context.logger.info('Step marked as completed', { jobId, step })
      } else {
        context.logger.warn('Step cannot be marked as completed in repository', { jobId, step })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.logger.error('Failed to mark step as completed', { jobId, step, error: message })
      throw error
    }
  }

  protected async updateJobStep(
    jobId: string,
    step: JobStep,
    context: ExecutionContext,
    completed: number = 0,
    total: number = 0,
  ): Promise<void> {
    try {
      db.jobs().updateJobStep(jobId, step)
      context.logger.info('Job step updated', { jobId, step, completed, total })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.logger.error('Failed to update job step', {
        jobId,
        step,
        completed,
        total,
        error: message,
      })
      throw error
    }
  }

  protected async updateJobTotalPages(
    jobId: string,
    totalPages: number,
    context: ExecutionContext,
  ): Promise<void> {
    try {
      db.jobs().updateJobTotalPages(jobId, totalPages)
      context.logger.info('Job total pages updated', { jobId, totalPages })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.logger.error('Failed to update job total pages', {
        jobId,
        totalPages,
        error: message,
      })
      throw error
    }
  }

  protected async updateJobCoverageWarnings(
    jobId: string,
    warnings: Array<{
      chunkIndex: number
      coverageRatio: number
      message: string
    }>,
    context: ExecutionContext,
  ): Promise<void> {
    try {
      db.jobs().updateJobCoverageWarnings?.(jobId, warnings)
      context.logger.info('Job coverage warnings updated', { jobId, warningCount: warnings.length })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.logger.error('Failed to update job coverage warnings', {
        jobId,
        warningCount: warnings.length,
        error: message,
      })
      throw error
    }
  }

  // Structured error logging for consistency
  protected logStructuredError(
    context: StepContext,
    operation: string,
    error: unknown,
    additionalContext?: Record<string, unknown>,
  ): void {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined

    // Log through the standard logger
    context.logger.error(`${this.stepName} - ${operation} failed`, {
      jobId: context.jobId,
      stepName: this.stepName,
      operation,
      error: errorMessage,
      stack: errorStack,
      ...additionalContext,
    })

    // Duplicate structured log to file-only via logger (console is managed globally)
    context.logger.error('structured', {
      ts: new Date().toISOString(),
      service: 'analyze-pipeline',
      stepName: this.stepName,
      operation,
      msg: `${this.stepName} - ${operation} failed`,
      jobId: context.jobId,
      error: errorMessage,
      stack: errorStack?.slice(0, 500),
      ...additionalContext,
    })
  }
}
