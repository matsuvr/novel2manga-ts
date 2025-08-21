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
    const dbAny: unknown = this.db
    // Strict primary path
    if (hasUpdateJobStep(dbAny)) {
      return dbAny.updateJobStep(id, currentStep, processedChunks, totalChunks, error, errorStep)
    }
    // Backward compatibility (legacy method name)
    if (hasLegacyUpdateStep(dbAny)) {
      return dbAny.updateStep(id, currentStep, processedChunks, totalChunks, error, errorStep)
    }
    throw new Error('JobDbPort implementation missing updateJobStep/updateStep')
  }

  async updateJobTotalPages(id: string, totalPages: number): Promise<void> {
    return this.db.updateJobTotalPages(id, totalPages)
  }

  async markStepCompleted(id: string, step: 'split' | 'analyze' | 'episode' | 'layout' | 'render') {
    const dbAny: unknown = this.db
    if (hasMarkJobStepCompleted(dbAny)) {
      return dbAny.markJobStepCompleted(id, step)
    }
    if (hasLegacyMarkStepCompleted(dbAny)) {
      return dbAny.markStepCompleted(id, step)
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

// ---- Local type guards for legacy compatibility (no any/unknown casts) ----

type LegacyUpdateStep = (
  id: string,
  currentStep: JobStep,
  processedChunks?: number,
  totalChunks?: number,
  error?: string,
  errorStep?: string,
) => Promise<void>

type LegacyMarkStepCompleted = (
  id: string,
  step: 'split' | 'analyze' | 'episode' | 'layout' | 'render',
) => Promise<void>

// Helper to check if an object has a function property
function hasFunctionProperty<T extends string>(db: unknown, prop: T): boolean {
  return !!db && typeof (db as Record<T, unknown>)[prop] === 'function'
}

function hasUpdateJobStep(db: unknown): db is { updateJobStep: JobDbPort['updateJobStep'] } {
  return hasFunctionProperty(db, 'updateJobStep')
}

function hasLegacyUpdateStep(db: unknown): db is { updateStep: LegacyUpdateStep } {
  return hasFunctionProperty(db, 'updateStep')
}

function hasMarkJobStepCompleted(
  db: unknown,
): db is { markJobStepCompleted: JobDbPort['markJobStepCompleted'] } {
  return hasFunctionProperty(db, 'markJobStepCompleted')
}

function hasLegacyMarkStepCompleted(
  db: unknown,
): db is { markStepCompleted: LegacyMarkStepCompleted } {
  return hasFunctionProperty(db, 'markStepCompleted')
}
