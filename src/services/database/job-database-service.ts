import { desc, eq, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import type { Job, NewJob } from '@/db/schema'
import { chunks, episodes, jobs } from '@/db/schema'
import { BaseDatabaseService } from './base-database-service'

type DrizzleDatabase = BetterSQLite3Database<typeof schema>

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
   * Create a job record with explicit id and optional metadata (compatibility path)
   */
  async createJobRecord(payload: {
    id: string
    novelId: string
    title?: string
    totalChunks?: number
    status?: string
    userId?: string
  }): Promise<string> {
    const now = new Date().toISOString()

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.insert(jobs)
          .values({
            id: payload.id,
            novelId: payload.novelId,
            userId: payload.userId ?? 'anonymous',
            jobName: payload.title,
            status: (payload.status as Job['status']) ?? 'pending',
            currentStep: 'split',
            totalChunks: payload.totalChunks ?? 0,
            createdAt: now,
            updatedAt: now,
          })
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(jobs).values({
          id: payload.id,
          novelId: payload.novelId,
          userId: payload.userId ?? 'anonymous',
          jobName: payload.title,
          status: (payload.status as Job['status']) ?? 'pending',
          currentStep: 'split',
          totalChunks: payload.totalChunks ?? 0,
          createdAt: now,
          updatedAt: now,
        })
      })
    }

    return payload.id
  }

  /**
   * Create a new job
   */
  async createJob(novelId: string, initialStep = 'split', userId = 'anonymous'): Promise<Job> {
    const jobId = crypto.randomUUID()
    const now = new Date().toISOString()

    const newJob: NewJob = {
      id: jobId,
      novelId,
      userId,
      status: 'processing',
      currentStep: initialStep,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
    }

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb.transaction((tx) => {
        tx.insert(jobs).values(newJob).run()
        return { ...newJob } as Job
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.insert(jobs).values(newJob)
      })
      return { ...newJob } as Job
    }
  }

  /**
   * Get job by ID
   */
  async getJob(id: string): Promise<Job | null> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase
      const results = drizzleDb.select().from(jobs).where(eq(jobs.id, id)).limit(1).all()
      return results.length > 0 ? (results[0] as Job) : null
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      const results = await drizzleDb.select().from(jobs).where(eq(jobs.id, id)).limit(1)
      return results.length > 0 ? (results[0] as Job) : null
    }
  }

  /**
   * Get job with progress information
   */
  async getJobWithProgress(id: string): Promise<JobWithProgress | null> {
    const job = await this.getJob(id)
    if (!job) return null

    let totalChunks: number
    let episodesData: Array<{
      episodeNumber: number
      title: string | null
      summary: string | null
    }>

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      // Get progress information
      const chunksCount = drizzleDb
        .select({ count: sql<number>`count(*)` })
        .from(chunks)
        .where(eq(chunks.jobId, id))
        .all()

      episodesData = drizzleDb
        .select({
          episodeNumber: episodes.episodeNumber,
          title: episodes.title,
          summary: episodes.summary,
        })
        .from(episodes)
        .where(eq(episodes.jobId, id))
        .orderBy(episodes.episodeNumber)
        .all()

      totalChunks = (chunksCount[0] as CountQueryResult | undefined)?.count ?? 0
    } else {
      // Get progress information
      const drizzleDb = this.db as DrizzleDatabase
      const chunksCount = await drizzleDb
        .select({ count: sql<number>`count(*)` })
        .from(chunks)
        .where(eq(chunks.jobId, id))

      episodesData = await drizzleDb
        .select({
          episodeNumber: episodes.episodeNumber,
          title: episodes.title,
          summary: episodes.summary,
        })
        .from(episodes)
        .where(eq(episodes.jobId, id))
        .orderBy(episodes.episodeNumber)

      totalChunks = (chunksCount[0] as CountQueryResult | undefined)?.count ?? 0
    }

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
  async updateJobStatus(jobId: string, status: string, error?: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({
            status,
            lastError: error,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({
            status,
            lastError: error,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Update job step
   */
  async updateJobStep(jobId: string, step: string, status = 'processing'): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({
            currentStep: step,
            status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({
            currentStep: step,
            status,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId: string, processedChunks: number): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({
            processedChunks,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({
            processedChunks,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Update current processing position (episode/page) for UX progress.
   */
  async updateProcessingPosition(
    jobId: string,
    params: { episode?: number | null; page?: number | null },
  ): Promise<void> {
    const upd: Partial<Pick<Job, 'processingEpisode' | 'processingPage' | 'updatedAt'>> = {
      updatedAt: new Date().toISOString(),
    }
    if (params.episode !== undefined) upd.processingEpisode = params.episode ?? null
    if (params.page !== undefined) upd.processingPage = params.page ?? null

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs).set(upd).where(eq(jobs.id, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.update(jobs).set(upd).where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Record job error with retry logic
   */
  async updateJobError(jobId: string, error: string, incrementRetry = true): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
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
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        const updateData: Partial<Job> = {
          lastError: error,
          status: 'failed',
          updatedAt: new Date().toISOString(),
        }

        if (incrementRetry) {
          // Get current retry count
          const currentJob = await tx
            .select({ retryCount: jobs.retryCount })
            .from(jobs)
            .where(eq(jobs.id, jobId))
            .limit(1)

          updateData.retryCount = (currentJob[0]?.retryCount || 0) + 1
        }

        await tx.update(jobs).set(updateData).where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Mark job step as completed
   */
  async markJobStepCompleted(
    jobId: string,
    completedStep: string,
    nextStep?: string,
  ): Promise<void> {
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

    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs).set(updateData).where(eq(jobs.id, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.update(jobs).set(updateData).where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Get jobs by novel ID
   */
  async getJobsByNovelId(novelId: string): Promise<Job[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb
        .select()
        .from(jobs)
        .where(eq(jobs.novelId, novelId))
        .orderBy(desc(jobs.createdAt))
        .all()
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      return await drizzleDb
        .select()
        .from(jobs)
        .where(eq(jobs.novelId, novelId))
        .orderBy(desc(jobs.createdAt))
    }
  }

  /** Get jobs by user ID */
  async getJobsByUser(userId: string): Promise<Job[]> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      return drizzleDb
        .select()
        .from(jobs)
        .where(eq(jobs.userId, userId))
        .orderBy(desc(jobs.createdAt))
        .all()
    } else {
      const drizzleDb = this.db as DrizzleDatabase
      return await drizzleDb
        .select()
        .from(jobs)
        .where(eq(jobs.userId, userId))
        .orderBy(desc(jobs.createdAt))
    }
  }

  /** Update total pages for a job */
  async updateJobTotalPages(jobId: string, totalPages: number): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({ totalPages, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({ totalPages, updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
      })
    }
  }

  /**
   * Delete job
   */
  async deleteJob(jobId: string): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        // Note: This should cascade delete related records
        // depending on your foreign key constraints
        tx.delete(jobs).where(eq(jobs.id, jobId)).run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx.delete(jobs).where(eq(jobs.id, jobId))
      })
    }
  }

  /** Update coverage warnings JSON on job row */
  async updateJobCoverageWarnings(
    jobId: string,
    warnings: Array<{ chunkIndex: number; coverageRatio: number; message: string }>,
  ): Promise<void> {
    if (this.isSync()) {
      const drizzleDb = this.db as DrizzleDatabase

      drizzleDb.transaction((tx) => {
        tx.update(jobs)
          .set({ coverageWarnings: JSON.stringify(warnings), updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
          .run()
      })
    } else {
      await this.adapter.transaction(async (tx: DrizzleDatabase) => {
        await tx
          .update(jobs)
          .set({ coverageWarnings: JSON.stringify(warnings), updatedAt: new Date().toISOString() })
          .where(eq(jobs.id, jobId))
      })
    }
  }
}
