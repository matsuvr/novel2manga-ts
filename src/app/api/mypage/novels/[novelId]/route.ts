import { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, SECURITY_CONFIGS } from '@/lib/api-security'
import { applyRateLimit } from '@/lib/rate-limiting'
import { ApiError as RouteApiError, withAuth } from '@/server/auth/effectToApiResponse'
import { db } from '@/services/database/database-service-factory'
import { deleteNovelForUser } from '@/services/mypage/novel-deletion-service'

interface RouteParams {
  params: {
    novelId: string
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    applyRateLimit(request, SECURITY_CONFIGS.sensitive.rateLimit)

    const response = await withAuth((user) => {
      const novelId = params.novelId

      if (typeof novelId !== 'string' || novelId.trim().length === 0) {
        return Effect.fail(
          new RouteApiError('VALIDATION_ERROR', '小説IDが必要です', 400, {
            novelId,
          }),
        )
      }

      return Effect.gen(function* ($) {
        const body = yield* $(
          Effect.tryPromise({
            try: async () => await request.json(),
            catch: () => ({}),
          }),
        )

        const confirmationToken = typeof body?.confirmationToken === 'string' ? body.confirmationToken : null

        if (!confirmationToken) {
          return Effect.fail(new RouteApiError('VALIDATION_ERROR', 'confirmationToken が必要です', 400, {}))
        }

        const novel = yield* $(
          Effect.tryPromise({
            try: () => db.novels().getNovel(novelId, user.id),
            catch: (error) =>
              new RouteApiError('DB_ERROR', '小説取得に失敗しました', 500, {
                novelId,
                userId: user.id,
                details: String(error),
              }),
          }),
        )

        if (!novel) {
          return Effect.fail(new RouteApiError('NOT_FOUND', '指定された小説が見つかりません', 404, { novelId }))
        }

        const expected = novel.title && novel.title.trim().length > 0 ? novel.title : 'DELETE'
        if (confirmationToken !== expected) {
          return Effect.fail(new RouteApiError('VALIDATION_ERROR', '確認テキストが一致しません', 400, {}))
        }

        return deleteNovelForUser(user.id, novelId, { preloadedNovel: novel }).pipe(
          Effect.map(() => ({ success: true as const, novelId })),
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

