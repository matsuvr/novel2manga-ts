import { Effect } from 'effect'
import { getLogger } from '@/infrastructure/logging/logger'
import { type StorageFileCategory, StorageFilesService } from '@/services/application/storage-files-service'
import { db } from '@/services/database/database-service-factory'
import { ApiError, ERROR_CODES } from '@/utils/api-error'
import type { Storage } from '@/utils/storage'
import { StorageFactory } from '@/utils/storage'

const storageResolvers: Record<StorageFileCategory, () => Promise<Storage>> = {
  original: StorageFactory.getNovelStorage,
  chunk: StorageFactory.getChunkStorage,
  analysis: StorageFactory.getAnalysisStorage,
  episode: StorageFactory.getAnalysisStorage,
  layout: StorageFactory.getLayoutStorage,
  render: StorageFactory.getRenderStorage,
  output: StorageFactory.getOutputStorage,
  metadata: StorageFactory.getLayoutStorage,
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }
  return { error }
}

export function deleteJobForUser(
  userId: string,
  jobId: string,
): Effect.Effect<void, ApiError, never> {
  return Effect.gen(function* () {
    const job = yield* Effect.tryPromise({
      try: () => db.jobs().getJob(jobId),
      catch: (error) =>
        new ApiError('ジョブ情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          details: normalizeError(error),
        }),
    })

    if (!job || job.userId !== userId) {
      return yield* Effect.fail(
        new ApiError('指定されたジョブが見つかりません', 404, ERROR_CODES.NOT_FOUND, { jobId }),
      )
    }

    const novel = yield* Effect.tryPromise({
      try: () => db.novels().getNovel(job.novelId, userId),
      catch: (error) =>
        new ApiError('小説情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeError(error),
        }),
    })

    if (!novel) {
      return yield* Effect.fail(
        new ApiError('削除対象の小説が見つかりません', 404, ERROR_CODES.NOT_FOUND, {
          jobId,
          novelId: job.novelId,
        }),
      )
    }

    const storageFilesService = new StorageFilesService()
    const storageRecords = yield* Effect.tryPromise({
      try: () => storageFilesService.listByNovel(job.novelId),
      catch: (error) =>
        new ApiError('ストレージ参照情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeError(error),
        }),
    })

    const seenFiles = new Set<string>()
    const storageCache = new Map<StorageFileCategory, Promise<Storage>>()
    const logger = getLogger().withContext({
      service: 'MypageJobDeletionService',
      jobId,
      novelId: job.novelId,
    })

    yield* Effect.forEach(
      storageRecords,
      (record) => {
        if (!record.filePath || seenFiles.has(record.filePath)) {
          return Effect.succeed(undefined)
        }
        seenFiles.add(record.filePath)

        const resolver = storageResolvers[record.fileCategory]
        if (!resolver) {
          logger.error('Unsupported storage category encountered during deletion', {
            filePath: record.filePath,
            fileCategory: record.fileCategory,
          })
          return Effect.fail(
            new ApiError(
              'サポートされていないストレージカテゴリです',
              500,
              ERROR_CODES.INVALID_STATE,
              {
                jobId,
                novelId: job.novelId,
                fileCategory: record.fileCategory,
                filePath: record.filePath,
              },
            ),
          )
        }

        return Effect.tryPromise({
          try: async () => {
            let storagePromise = storageCache.get(record.fileCategory)
            if (!storagePromise) {
              storagePromise = resolver()
              storageCache.set(record.fileCategory, storagePromise)
            }

            const storage = await storagePromise
            await storage.delete(record.filePath)
          },
          catch: (error) =>
            new ApiError('ストレージファイルの削除に失敗しました', 500, ERROR_CODES.STORAGE_ERROR, {
              jobId,
              novelId: job.novelId,
              fileCategory: record.fileCategory,
              filePath: record.filePath,
              details: normalizeError(error),
            }),
        })
      },
      { concurrency: 1 },
    )

    yield* Effect.tryPromise({
      try: () => db.novels().deleteNovel(job.novelId),
      catch: (error) =>
        new ApiError('小説の削除に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeError(error),
        }),
    })
  })
}

