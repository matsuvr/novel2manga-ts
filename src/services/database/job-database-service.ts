import { desc, eq, sql } from 'drizzle-orm'
import type { Job, NewJob } from '@/db/schema'
import { chunks, episodes, jobs } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

export interface JobProgress {
  currentStep: string
  processedChunks: number
  totalChunks: number
  episodes: Array<{
    episodeNumber: number
    title?: string
    summary?: string
  }>
}

type CountQueryResult = { count: number }

export interface JobWithProgress {
  id: string
  novelId: string
  status: string
  currentStep: string
  createdAt: string | null
  updatedAt: string | null
  totalChunks?: number | null
  totalEpisodes?: number | null
  totalPages?: number | null
  renderedPages?: number | null
  lastError?: string | null
  retryCount?: number | null
  progress: JobProgress
}

/**
 * Job-specific database operations
 * Follows Single Responsibility Principle
 */
export class JobDatabaseService extends BaseDatabaseService {
  /**
   * Create a new job
   */
  createJob(novelId: string, initialStep = 'split'): Job {
    const jobId = crypto.randomUUID()
    const now = new Date().toISOString()

    return this.executeInTransaction((tx) => {
      const newJob: NewJob = {
        id: jobId,
        novelId,
        status: 'processing',
        currentStep: initialStep,
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
      }

      tx.insert(jobs).values(newJob).run()
      return { ...newJob } as Job
    })
  }

  /**
   * Get job by ID
   */
  getJob(id: string): Job | null {
    const results = this.db.select().from(jobs).where(eq(jobs.id, id)).limit(1).all()

    return results.length > 0 ? (results[0] as Job) : null
  }

  /**
   * Get job with progress information
   */
  getJobWithProgress(id: string): JobWithProgress | null {
    const job = this.getJob(id)
    if (!job) return null

    // Get progress information
    const chunksCount = this.db
      .select({ count: sql<number>`count(*)` })
      .from(chunks)
      .where(eq(chunks.jobId, id))
      .all()

    const episodesData = this.db
      .select({
        episodeNumber: episodes.episodeNumber,
        title: episodes.title,
        summary: episodes.summary,
      })
      .from(episodes)
      .where(eq(episodes.jobId, id))
      .orderBy(episodes.episodeNumber)
      .all()

    const totalChunks = (chunksCount[0] as CountQueryResult | undefined)?.count ?? 0

    const progress: JobProgress = {
      currentStep: job.currentStep,
      processedChunks: 0, // This would need additional logic to track processed chunks
      totalChunks,
      episodes: episodesData.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title || undefined,
        summary: ep.summary || undefined,
      })),
    }

    return {
      ...job,
      progress,
    }
  }

  /**
   * Update job status
   */
  updateJobStatus(jobId: string, status: string): void {
    this.executeInTransaction((tx) => {
      tx.update(jobs)
        .set({ status, updatedAt: new Date().toISOString() })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  /**
   * Update job step
   */
  updateJobStep(jobId: string, step: string, status = 'processing'): void {
    this.executeInTransaction((tx) => {
      tx.update(jobs)
        .set({
          currentStep: step,
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  /**
   * Update job progress
   */
  updateJobProgress(jobId: string, processedChunks: number): void {
    this.executeInTransaction((tx) => {
      tx.update(jobs)
        .set({
          processedChunks,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, jobId))
        .run()
    })
  }

  /**
   * Record job error with retry logic
   */
  updateJobError(jobId: string, error: string, incrementRetry = true): void {
    this.executeInTransaction((tx) => {
      const updateData: Partial<Job> = {
        lastError: error,
        status: 'failed',
        updatedAt: new Date().toISOString(),
      }

      if (incrementRetry) {
        // Get current retry count
        const currentJob = tx
          .select({ retryCount: jobs.retryCount })
          .from(jobs)
          .where(eq(jobs.id, jobId))
          .limit(1)
          .all()[0]

        updateData.retryCount = (currentJob?.retryCount || 0) + 1
      }

      tx.update(jobs).set(updateData).where(eq(jobs.id, jobId)).run()
    })
  }

  /**
   * Mark job step as completed
   */
  markJobStepCompleted(jobId: string, completedStep: string, nextStep?: string): void {
    this.executeInTransaction((tx) => {
      const updateData: Partial<Job> = {
        updatedAt: new Date().toISOString(),
      }

      // Set step completion flags
      switch (completedStep) {
        case 'split':
          updateData.splitCompleted = true
          break
        case 'analyze':
          updateData.analyzeCompleted = true
          break
        case 'episode':
          updateData.episodeCompleted = true
          break
        case 'layout':
          updateData.layoutCompleted = true
          break
        case 'render':
          updateData.renderCompleted = true
          updateData.status = 'completed'
          break
      }

      if (nextStep) {
        updateData.currentStep = nextStep
      }

      tx.update(jobs).set(updateData).where(eq(jobs.id, jobId)).run()
    })
  }

  /**
   * Get jobs by novel ID
   */
  getJobsByNovelId(novelId: string): Job[] {
    return this.db
      .select()
      .from(jobs)
      .where(eq(jobs.novelId, novelId))
      .orderBy(desc(jobs.createdAt))
      .all()
  }

  /**
   * Delete job
   */
  deleteJob(jobId: string): void {
    this.executeInTransaction((tx) => {
      // Note: This should cascade delete related records
      // depending on your foreign key constraints
      tx.delete(jobs).where(eq(jobs.id, jobId)).run()
    })
  }
}
