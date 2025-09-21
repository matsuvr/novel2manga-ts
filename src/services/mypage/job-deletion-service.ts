import { Effect } from 'effect'
import { StorageFilesService } from '@/services/application/storage-files-service'
import { db } from '@/services/database/database-service-factory'
import {
  deleteStorageArtifacts,
  normalizeDeletionError,
} from '@/services/mypage/storage-cleanup'
import { ApiError, ERROR_CODES } from '@/utils/api-error'

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
          details: normalizeDeletionError(error),
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
          details: normalizeDeletionError(error),
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
      try: () => storageFilesService.listByJob(jobId),
      catch: (error) =>
        new ApiError('ストレージ参照情報の取得に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeDeletionError(error),
        }),
    })

    yield* deleteStorageArtifacts(storageRecords, {
      jobId,
      novelId: job.novelId,
    })

    // Remove storage records associated with this job
    yield* Effect.tryPromise({
      try: () => storageFilesService.deleteByJob(jobId),
      catch: (error) =>
        new ApiError('ストレージ参照情報の削除に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeDeletionError(error),
        }),
    })

    // Finally delete the job record itself (do not delete the novel)
    yield* Effect.tryPromise({
      try: () => db.jobs().deleteJob(jobId),
      catch: (error) =>
        new ApiError('ジョブの削除に失敗しました', 500, ERROR_CODES.DATABASE_ERROR, {
          jobId,
          novelId: job.novelId,
          details: normalizeDeletionError(error),
        }),
    })
  })
}

