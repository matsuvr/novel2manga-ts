import { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, SECURITY_CONFIGS } from '@/lib/api-security'
import { applyRateLimit } from '@/lib/rate-limiting'
import { ApiError as RouteApiError, withAuth } from '@/server/auth/effectToApiResponse'
import { db } from '@/services/database/database-service-factory'
import { deleteJobForUser } from '@/services/mypage/job-deletion-service'

interface RouteParams {
  params: {
    jobId: string
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    applyRateLimit(request, SECURITY_CONFIGS.sensitive.rateLimit)

    const response = await withAuth((user) => {
      const jobId = params.jobId

      if (typeof jobId !== 'string' || jobId.trim().length === 0) {
        return Effect.fail(
          new RouteApiError('VALIDATION_ERROR', 'ジョブIDが必要です', 400, {
            jobId,
          }),
        )
      }

      return Effect.gen(function* ($) {
        // Parse body to get confirmation token
        const body = yield* $(Effect.tryPromise({
          try: async () => await request.json(),
          catch: () => ({}),
        }))

        const confirmationToken = body?.confirmationToken

        if (!confirmationToken || typeof confirmationToken !== 'string') {
          return Effect.fail(new RouteApiError('VALIDATION_ERROR', 'confirmationToken が必要です', 400, {}))
        }

        // Fetch job to check expected token (novel title or fallback)
        const job = yield* $(
          Effect.tryPromise({
            try: () => db.jobs().getJob(jobId),
            catch: (error) =>
              new RouteApiError('DB_ERROR', 'ジョブ取得に失敗しました', 500, { jobId, details: String(error) }),
          }),
        )

        if (!job || job.userId !== user.id) {
          return Effect.fail(new RouteApiError('NOT_FOUND', '指定されたジョブが見つかりません', 404, { jobId }))
        }

        const novel = yield* $(
          Effect.tryPromise({
            try: () => db.novels().getNovel(job.novelId, user.id),
            catch: (error) =>
              new RouteApiError('DB_ERROR', '小説取得に失敗しました', 500, { jobId, novelId: job.novelId, details: String(error) }),
          }),
        )

        const expected = novel?.title ?? 'DELETE'
        if (confirmationToken !== expected) {
          return Effect.fail(new RouteApiError('VALIDATION_ERROR', '確認テキストが一致しません', 400, {}))
        }

        return deleteJobForUser(user.id, jobId).pipe(
          Effect.map(() => ({ success: true as const, jobId })),
          Effect.catchAll((error) =>
            Effect.fail(
              new RouteApiError(
                error.code ?? 'DELETE_FAILED',
                error.message,
                error.statusCode ?? 500,
                error.details,
              ),
            ),
          ),
        )
      })
    })(request)

    return addSecurityHeaders(response)
  } catch (error) {
    if (error instanceof RouteApiError) {
      const response = NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
        },
        { status: error.status },
      )
      return addSecurityHeaders(response)
    }

    throw error
  }
}

