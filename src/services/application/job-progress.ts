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
    return this.jobRepo.getJobWithProgress(id)
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
