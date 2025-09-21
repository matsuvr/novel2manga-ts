import { Effect } from 'effect'
import { getLogger } from '@/infrastructure/logging/logger'
import type {
  StorageFileCategory,
  StorageFileRecord,
} from '@/services/application/storage-files-service'
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

export interface StorageCleanupContext {
  novelId: string
  jobId?: string
}

export function normalizeDeletionError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    }
  }

  return { error }
}

export function deleteStorageArtifacts(
  records: StorageFileRecord[],
  context: StorageCleanupContext,
): Effect.Effect<void, ApiError, never> {
  const seenFiles = new Set<string>()
  const storageCache = new Map<StorageFileCategory, Promise<Storage>>()
  const logger = getLogger().withContext({
    service: 'MypageStorageCleanupService',
    novelId: context.novelId,
    ...(context.jobId ? { jobId: context.jobId } : {}),
  })

  return Effect.forEach(
    records,
    (record) => {
      if (!record.filePath || seenFiles.has(record.filePath)) {
        return Effect.succeed<void>(undefined)
      }

      seenFiles.add(record.filePath)

      const resolver = storageResolvers[record.fileCategory]
      if (!resolver) {
        logger.error('Unsupported storage category encountered during deletion', {
          fileCategory: record.fileCategory,
          filePath: record.filePath,
        })

        return Effect.fail(
          new ApiError('サポートされていないストレージカテゴリです', 500, ERROR_CODES.INVALID_STATE, {
            novelId: context.novelId,
            ...(context.jobId ? { jobId: context.jobId } : {}),
            fileCategory: record.fileCategory,
            filePath: record.filePath,
          }),
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
            novelId: context.novelId,
            ...(context.jobId ? { jobId: context.jobId } : {}),
            fileCategory: record.fileCategory,
            filePath: record.filePath,
            details: normalizeDeletionError(error),
          }),
      })
    },
    { concurrency: 5 },
  ).pipe(Effect.map(() => undefined))
}

