import { Effect } from 'effect'
import { StorageFilesService } from '@/services/application/storage-files-service'
import { db } from '@/services/database/database-service-factory'
import { deleteJobForUser } from '@/services/mypage/job-deletion-service'
import {
  deleteStorageArtifacts,
  normalizeDeletionError,
} from '@/services/mypage/storage-cleanup'
import type { Novel } from '@/types'
import { ApiError, ERROR_CODES } from '@/utils/api-error'

interface DeleteNovelOptions {
  preloadedNovel?: Novel | null
}

export function deleteNovelForUser(
  userId: string,
  novelId: string,
  options?: DeleteNovelOptions,
): Effect.Effect<void, ApiError, never> {
  return Effect.gen(function* () {
    const novel = options?.preloadedNovel
      ? options.preloadedNovel
      : yield* Effect.tryPromise({
          try: () => db.novels().getNovel(novelId, userId),
          catch: (error) =>
            new ApiError('小説情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
              novelId,
              details: normalizeDeletionError(error),
            }),
        })

    if (!novel || novel.userId !== userId) {
      return yield* Effect.fail(
        new ApiError('指定された小説が見つかりません', 404, ERROR_CODES.NOT_FOUND, {
          novelId,
        }),
      )
    }

    const jobs = yield* Effect.tryPromise({
      try: () => db.jobs().getJobsByNovelId(novelId),
      catch: (error) =>
        new ApiError('関連ジョブの取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          novelId,
          details: normalizeDeletionError(error),
        }),
    })

    const unauthorizedJob = jobs.find((job) => job.userId !== userId)
    if (unauthorizedJob) {
      return yield* Effect.fail(
        new ApiError('他のユーザーのジョブが含まれているため削除できません', 403, ERROR_CODES.FORBIDDEN, {
          novelId,
          jobId: unauthorizedJob.id,
          jobUserId: unauthorizedJob.userId,
        }),
      )
    }

    if (jobs.length > 0) {
      yield* Effect.forEach(
        jobs,
        (job) => deleteJobForUser(userId, job.id),
        { concurrency: 2 },
      )
    }

    const storageFilesService = new StorageFilesService()

    const storageRecords = yield* Effect.tryPromise({
      try: () => storageFilesService.listByNovel(novelId),
      catch: (error) =>
        new ApiError('ストレージ参照情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          novelId,
          details: normalizeDeletionError(error),
        }),
    })

    if (storageRecords.length > 0) {
      yield* deleteStorageArtifacts(storageRecords, { novelId })
    }

    yield* Effect.tryPromise({
      try: () => storageFilesService.deleteByNovel(novelId),
      catch: (error) =>
        new ApiError('ストレージ参照情報の削除に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          novelId,
          details: normalizeDeletionError(error),
        }),
    })

    yield* Effect.tryPromise({
      try: () => db.novels().deleteNovel(novelId),
      catch: (error) =>
        new ApiError('小説の削除に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          novelId,
          details: normalizeDeletionError(error),
        }),
    })
  })
}

