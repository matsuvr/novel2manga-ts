import type { Job } from '@/db'
import type { JobProgress } from '@/types/job'
import type { JobDbPort, JobStep } from './ports'

// Re-export for backward compatibility
export type { JobDbPort } from './ports'

export class JobRepository {
  constructor(private readonly db: JobDbPort) {}

  async getJob(id: string) {
    return this.db.getJob(id)
  }

  async getJobWithProgress(id: string) {
    return this.db.getJobWithProgress(id)
  }

  // Create a job (id optional)
  async create(payload: {
    id?: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
  }): Promise<string> {
    return this.db.createJob(payload)
  }

  async getByNovelId(novelId: string): Promise<Job[]> {
    return this.db.getJobsByNovelId(novelId)
  }

  async updateStatus(
    id: string,
    status: Parameters<JobDbPort['updateJobStatus']>[1],
    error?: string,
  ) {
    return this.db.updateJobStatus(id, status, error)
  }

  async updateStep(
    id: string,
    currentStep: JobStep,
    processedChunks?: number,
    totalChunks?: number,
    error?: string,
    errorStep?: string,
  ): Promise<void> {
    // Primary path: standardized JobDbPort method
    const anyDb = this.db as unknown as {
      updateJobStep?: (
        id: string,
        currentStep: JobStep,
        processedChunks?: number,
        totalChunks?: number,
        error?: string,
        errorStep?: string,
      ) => Promise<void>
      // Backward-compat shim for older or test mocks
      updateStep?: (
        id: string,
        currentStep: JobStep,
        processedChunks?: number,
        totalChunks?: number,
        error?: string,
        errorStep?: string,
      ) => Promise<void>
    }

    if (typeof anyDb.updateJobStep === 'function') {
      return anyDb.updateJobStep(id, currentStep, processedChunks, totalChunks, error, errorStep)
    }
    if (typeof anyDb.updateStep === 'function') {
      return anyDb.updateStep(id, currentStep, processedChunks, totalChunks, error, errorStep)
    }

    throw new Error('JobDbPort implementation missing updateJobStep/updateStep')
  }

  async markStepCompleted(id: string, step: 'split' | 'analyze' | 'episode' | 'layout' | 'render') {
    const anyDb = this.db as unknown as {
      markJobStepCompleted?: (
        id: string,
        step: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
      ) => Promise<void>
      markStepCompleted?: (
        id: string,
        step: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
      ) => Promise<void>
    }
    if (typeof anyDb.markJobStepCompleted === 'function') {
      return anyDb.markJobStepCompleted(id, step)
    }
    if (typeof anyDb.markStepCompleted === 'function') {
      return anyDb.markStepCompleted(id, step)
    }
    throw new Error('JobDbPort implementation missing markJobStepCompleted/markStepCompleted')
  }

  async updateProgress(id: string, progress: JobProgress): Promise<void> {
    return this.db.updateJobProgress(id, progress)
  }

  async updateError(id: string, error: string, step: string, incrementRetry = true) {
    return this.db.updateJobError(id, error, step, incrementRetry)
  }
}
