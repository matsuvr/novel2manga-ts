import { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, SECURITY_CONFIGS } from '@/lib/api-security'
import { applyRateLimit } from '@/lib/rate-limiting'
import { ApiError as RouteApiError, withAuth } from '@/server/auth/effectToApiResponse'
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

      return deleteJobForUser(user.id, jobId).pipe(
        Effect.map(() => ({
          success: true as const,
          jobId,
        })),
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

