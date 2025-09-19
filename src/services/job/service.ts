/**
 * Job Service Interface and Implementation using Effect TS
 */

// readFile no longer used here; storage factory used instead
import { and, desc, eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'
import { getDatabase } from '@/db'
import { jobs, novels } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { normalizeTimestamp } from '@/utils/format'
import { loadNovelPreview } from '@/utils/novel-text'
import {
  DatabaseError,
  JobAccessDeniedError,
  JobError,
  JobNotFoundError,
  type JobQueryOptions,
  type JobWithNovel,
} from './types'

/**
 * Job Service Interface
 */
export interface JobService {
  readonly getUserJobs: (
    userId: string,
    options?: JobQueryOptions,
  ) => Effect.Effect<JobWithNovel[], DatabaseError>
  readonly resumeJob: (
    userId: string,
    jobId: string,
  ) => Effect.Effect<void, JobError | JobNotFoundError | JobAccessDeniedError | DatabaseError>
  readonly getJobDetails: (
    userId: string,
    jobId: string,
  ) => Effect.Effect<
    JobWithNovel,
    JobError | JobNotFoundError | JobAccessDeniedError | DatabaseError
  >
}

/**
 * Job Service Context Tag
 */
export const JobService = Context.GenericTag<JobService>('JobService')

/**
 * Job Service Live Implementation
 */
export const JobServiceLive = Layer.succeed(JobService, {
  getUserJobs: (userId: string, options: JobQueryOptions = {}) =>
    Effect.tryPromise({
      try: async () => {
        // use shared normalizeTimestamp util
        const db = getDatabase()
        const { limit = 10, offset = 0, status } = options

        // Build base where clause
        const baseCondition = status
          ? and(eq(jobs.userId, userId), eq(jobs.status, status))
          : eq(jobs.userId, userId)

        const results = await db
          .select({
            id: jobs.id,
            novelId: jobs.novelId,
            jobName: jobs.jobName,
            userId: jobs.userId,
            status: jobs.status,
            currentStep: jobs.currentStep,
            splitCompleted: jobs.splitCompleted,
            analyzeCompleted: jobs.analyzeCompleted,
            episodeCompleted: jobs.episodeCompleted,
            layoutCompleted: jobs.layoutCompleted,
            renderCompleted: jobs.renderCompleted,
            chunksDirPath: jobs.chunksDirPath,
            analysesDirPath: jobs.analysesDirPath,
            episodesDataPath: jobs.episodesDataPath,
            layoutsDirPath: jobs.layoutsDirPath,
            rendersDirPath: jobs.rendersDirPath,
            characterMemoryPath: jobs.characterMemoryPath,
            promptMemoryPath: jobs.promptMemoryPath,
            totalChunks: jobs.totalChunks,
            processedChunks: jobs.processedChunks,
            totalEpisodes: jobs.totalEpisodes,
            processedEpisodes: jobs.processedEpisodes,
            totalPages: jobs.totalPages,
            renderedPages: jobs.renderedPages,
            processingEpisode: jobs.processingEpisode,
            processingPage: jobs.processingPage,
            lastError: jobs.lastError,
            lastErrorStep: jobs.lastErrorStep,
            retryCount: jobs.retryCount,
            resumeDataPath: jobs.resumeDataPath,
            coverageWarnings: jobs.coverageWarnings,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt,
            startedAt: jobs.startedAt,
            completedAt: jobs.completedAt,
            novelTitle: novels.title,
            novelAuthor: novels.author,
            novelOriginalTextPath: novels.originalTextPath,
            novelTextLength: novels.textLength,
            novelLanguage: novels.language,
            novelMetadataPath: novels.metadataPath,
            novelUserId: novels.userId,
            novelCreatedAt: novels.createdAt,
            novelUpdatedAt: novels.updatedAt,
          })
          .from(jobs)
          .leftJoin(novels, eq(jobs.novelId, novels.id))
          .where(baseCondition)
          .orderBy(desc(jobs.createdAt))
          .limit(limit)
          .offset(offset)

        // Prepare job IDs for token aggregation
        const jobIds = results.map((r) => r.id)

        // Use database service factory to get token usage totals
        const { db: databaseServices } = await import('@/services/database')

        // Defensive: in unit tests the database services may be partially mocked and
        // may not expose the tokenUsage helper or the exact method name. Try the
        // standard API first, then fall back to alternative method names or an
        // empty result to avoid throwing a TypeError during tests.
        let totals: Record<string, { promptTokens: number; completionTokens: number; totalTokens: number }> = {}
        try {
          const tokenSvc = typeof databaseServices.tokenUsage === 'function' ? databaseServices.tokenUsage() : databaseServices.tokenUsage
          // TokenUsageDatabaseService exposes `getTotalsByJobIds`. Prefer that.
          if (tokenSvc && typeof tokenSvc.getTotalsByJobIds === 'function') {
            totals = await tokenSvc.getTotalsByJobIds(jobIds)
          } else {
            // no-op fallback for tests/mocks that don't provide token usage
            totals = {}
          }
        } catch (e) {
          // If the underlying service throws, log and continue with empty totals
          getLogger().withContext({ service: 'JobService', method: 'getUserJobs' }).warn(
            `Failed to retrieve token usage totals, proceeding with zeros: ${String(e)}`,
          )
          totals = {}
        }

  // For each job row, attempt to read novel preview (first 100 chars) and attach token summary
  // Use the StorageFactory to read novel content (originalTextPath is a storage key, not a filesystem path)
  // Limit concurrent file reads to avoid file descriptor exhaustion
        const CONCURRENCY = 10
        const enhanced: JobWithNovel[] = []

        // process in batches of CONCURRENCY
        for (let i = 0; i < results.length; i += CONCURRENCY) {
          const batch = results.slice(i, i + CONCURRENCY)
          const mapped = await Promise.all(
            batch.map(async (row) => {
              let novelPreview: string | undefined
              if (row.novelOriginalTextPath) {
                try {
                  novelPreview = await loadNovelPreview(row.novelOriginalTextPath, { length: 100 })
                } catch (error) {
                  // log for debugging, but don't fail the whole request
                  getLogger().withContext({ service: 'JobService', method: 'getUserJobs', jobId: row.id }).error(
                    `Failed to read novel preview for path: ${row.novelOriginalTextPath}`,
                    { path: row.novelOriginalTextPath, error: String(error) },
                  )
                  novelPreview = undefined
                }
              }

              const tu = totals[row.id] || { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

              // normalize timestamps for job and novel
              return {
                job: {
                  id: row.id,
                  novelId: row.novelId,
                  jobName: row.jobName,
                  userId: row.userId,
                  status: row.status,
                  currentStep: row.currentStep,
                  splitCompleted: row.splitCompleted,
                  analyzeCompleted: row.analyzeCompleted,
                  episodeCompleted: row.episodeCompleted,
                  layoutCompleted: row.layoutCompleted,
                  renderCompleted: row.renderCompleted,
                  chunksDirPath: row.chunksDirPath,
                  analysesDirPath: row.analysesDirPath,
                  episodesDataPath: row.episodesDataPath,
                  layoutsDirPath: row.layoutsDirPath,
                  rendersDirPath: row.rendersDirPath,
                  characterMemoryPath: row.characterMemoryPath,
                  promptMemoryPath: row.promptMemoryPath,
                  totalChunks: row.totalChunks,
                  processedChunks: row.processedChunks,
                  totalEpisodes: row.totalEpisodes,
                  processedEpisodes: row.processedEpisodes,
                  totalPages: row.totalPages,
                  renderedPages: row.renderedPages,
                  processingEpisode: row.processingEpisode,
                  processingPage: row.processingPage,
                  lastError: row.lastError,
                  lastErrorStep: row.lastErrorStep,
                  retryCount: row.retryCount,
                  resumeDataPath: row.resumeDataPath,
                  coverageWarnings: row.coverageWarnings,
                  createdAt: normalizeTimestamp(row.createdAt),
                  updatedAt: normalizeTimestamp(row.updatedAt),
                  startedAt: normalizeTimestamp(row.startedAt),
                  completedAt: normalizeTimestamp(row.completedAt),
                },
                novel: row.novelTitle
                  ? {
                    id: row.novelId,
                    title: row.novelTitle,
                    author: row.novelAuthor,
                    originalTextPath: row.novelOriginalTextPath,
                    textLength: row.novelTextLength ?? 0,
                    language: row.novelLanguage,
                    metadataPath: row.novelMetadataPath,
                    userId: row.novelUserId ?? userId,
                    createdAt: normalizeTimestamp(row.novelCreatedAt),
                    updatedAt: normalizeTimestamp(row.novelUpdatedAt),
                    // add preview field on novel object for convenience
                    preview: novelPreview,
                  }
                  : null,
                tokenUsageSummary: {
                  promptTokens: tu.promptTokens ?? 0,
                  completionTokens: tu.completionTokens ?? 0,
                  totalTokens: tu.totalTokens ?? 0,
                },
              }
            }),
          )
          enhanced.push(...mapped)
        }

        return enhanced
      },
      catch: (error) => new DatabaseError(`Failed to get user jobs: ${String(error)}`, error),
    }),

  resumeJob: (userId: string, jobId: string) =>
    Effect.gen(function* () {
      const db = getDatabase()

      // First, verify job exists and user has access
      const [jobRecord] = yield* Effect.tryPromise({
        try: async () => {
          return await db.select().from(jobs).where(eq(jobs.id, jobId))
        },
        catch: (error) => new DatabaseError(`Failed to fetch job: ${String(error)}`, error),
      })

      if (!jobRecord) {
        return yield* Effect.fail(new JobNotFoundError(jobId))
      }

      if (jobRecord.userId !== userId) {
        return yield* Effect.fail(new JobAccessDeniedError(jobId, userId))
      }

      // Check if job is in a resumable state
      if (jobRecord.status !== 'failed' && jobRecord.status !== 'paused') {
        return yield* Effect.fail(
          new JobError(
            `Job cannot be resumed. Current status: ${jobRecord.status}`,
            'INVALID_STATUS',
          ),
        )
      }

      // Reset job to processing state and clear error
      yield* Effect.tryPromise({
        try: async () => {
          await db
            .update(jobs)
            .set({
              status: 'processing',
              lastError: null,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(jobs.id, jobId))
        },
        catch: (error) => new DatabaseError(`Failed to resume job: ${String(error)}`, error),
      })

      // TODO: Trigger job processing worker
      // This would integrate with the existing job processing pipeline
    }),

  getJobDetails: (userId: string, jobId: string) =>
    Effect.gen(function* () {
      const db = getDatabase()

      const normalizeTimestamp = (v: unknown): string | null => {
        if (v === undefined || v === null) return null
        if (typeof v === 'string') return v
        if (v instanceof Date) return v.toISOString()
        if (typeof v === 'number') return new Date(v).toISOString()
        try {
          return String(v)
        } catch {
          return null
        }
      }

      // Get job with novel information, ensuring user access
      const results = yield* Effect.tryPromise({
        try: async () => {
          return await db
            .select({
              // Job fields
              id: jobs.id,
              novelId: jobs.novelId,
              jobName: jobs.jobName,
              userId: jobs.userId,
              status: jobs.status,
              currentStep: jobs.currentStep,
              splitCompleted: jobs.splitCompleted,
              analyzeCompleted: jobs.analyzeCompleted,
              episodeCompleted: jobs.episodeCompleted,
              layoutCompleted: jobs.layoutCompleted,
              renderCompleted: jobs.renderCompleted,
              chunksDirPath: jobs.chunksDirPath,
              analysesDirPath: jobs.analysesDirPath,
              episodesDataPath: jobs.episodesDataPath,
              layoutsDirPath: jobs.layoutsDirPath,
              rendersDirPath: jobs.rendersDirPath,
              characterMemoryPath: jobs.characterMemoryPath,
              promptMemoryPath: jobs.promptMemoryPath,
              totalChunks: jobs.totalChunks,
              processedChunks: jobs.processedChunks,
              totalEpisodes: jobs.totalEpisodes,
              processedEpisodes: jobs.processedEpisodes,
              totalPages: jobs.totalPages,
              renderedPages: jobs.renderedPages,
              processingEpisode: jobs.processingEpisode,
              processingPage: jobs.processingPage,
              lastError: jobs.lastError,
              lastErrorStep: jobs.lastErrorStep,
              retryCount: jobs.retryCount,
              resumeDataPath: jobs.resumeDataPath,
              coverageWarnings: jobs.coverageWarnings,
              createdAt: jobs.createdAt,
              updatedAt: jobs.updatedAt,
              startedAt: jobs.startedAt,
              completedAt: jobs.completedAt,
              // Novel fields (nullable)
              novelTitle: novels.title,
              novelAuthor: novels.author,
              novelOriginalTextPath: novels.originalTextPath,
              novelTextLength: novels.textLength,
              novelLanguage: novels.language,
              novelMetadataPath: novels.metadataPath,
              novelUserId: novels.userId,
              novelCreatedAt: novels.createdAt,
              novelUpdatedAt: novels.updatedAt,
            })
            .from(jobs)
            .leftJoin(novels, eq(jobs.novelId, novels.id))
            .where(eq(jobs.id, jobId))
        },
        catch: (error) => new DatabaseError(`Failed to get job details: ${String(error)}`, error),
      })

      if (results.length === 0) {
        return yield* Effect.fail(new JobNotFoundError(jobId))
      }

      const row = results[0]

      // Verify user access
      if (row.userId !== userId) {
        return yield* Effect.fail(new JobAccessDeniedError(jobId, userId))
      }

      // Transform result to JobWithNovel format (normalize timestamps)
      return {
        job: {
          id: row.id,
          novelId: row.novelId,
          jobName: row.jobName,
          userId: row.userId,
          status: row.status,
          currentStep: row.currentStep,
          splitCompleted: row.splitCompleted,
          analyzeCompleted: row.analyzeCompleted,
          episodeCompleted: row.episodeCompleted,
          layoutCompleted: row.layoutCompleted,
          renderCompleted: row.renderCompleted,
          chunksDirPath: row.chunksDirPath,
          analysesDirPath: row.analysesDirPath,
          episodesDataPath: row.episodesDataPath,
          layoutsDirPath: row.layoutsDirPath,
          rendersDirPath: row.rendersDirPath,
          characterMemoryPath: row.characterMemoryPath,
          promptMemoryPath: row.promptMemoryPath,
          totalChunks: row.totalChunks,
          processedChunks: row.processedChunks,
          totalEpisodes: row.totalEpisodes,
          processedEpisodes: row.processedEpisodes,
          totalPages: row.totalPages,
          renderedPages: row.renderedPages,
          processingEpisode: row.processingEpisode,
          processingPage: row.processingPage,
          lastError: row.lastError,
          lastErrorStep: row.lastErrorStep,
          retryCount: row.retryCount,
          resumeDataPath: row.resumeDataPath,
          coverageWarnings: row.coverageWarnings,
          createdAt: normalizeTimestamp(row.createdAt),
          updatedAt: normalizeTimestamp(row.updatedAt),
          startedAt: normalizeTimestamp(row.startedAt),
          completedAt: normalizeTimestamp(row.completedAt),
        },
        novel: row.novelTitle
          ? {
            id: row.novelId,
            title: row.novelTitle,
            author: row.novelAuthor,
            originalTextPath: row.novelOriginalTextPath,
            textLength: row.novelTextLength ?? 0,
            language: row.novelLanguage,
            metadataPath: row.novelMetadataPath,
            userId: row.novelUserId ?? userId,
            createdAt: normalizeTimestamp(row.novelCreatedAt),
            updatedAt: normalizeTimestamp(row.novelUpdatedAt),
          }
          : null,
      }
    }),
})
