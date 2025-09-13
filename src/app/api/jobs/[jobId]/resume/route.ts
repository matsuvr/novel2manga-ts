/**
 * Job Resume API Endpoint
 * POST /api/jobs/[jobId]/resume - Resume a failed or paused job
 */

import { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { SECURITY_CONFIGS } from '@/lib/api-security'
import { ApiError, withAuth } from '@/server/auth/effectToApiResponse'
import { JobService, JobServiceLive } from '@/services/job'

interface RouteParams {
  params: {
    jobId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  // Apply security measures manually for route with params
  const { applyRateLimit } = await import('@/lib/rate-limiting')
  const { addSecurityHeaders } = await import('@/lib/api-security')

  try {
    // Apply stricter rate limiting for job operations (no-op if undefined)
    applyRateLimit(request, SECURITY_CONFIGS.sensitive.rateLimit)

    const result = await withAuth((user) => {
      const { jobId } = params

      if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
        return Effect.fail(new ApiError('VALIDATION_ERROR', 'Job ID is required', 400))
      }

      return Effect.gen(function* () {
        const jobService = yield* JobService
        yield* jobService.resumeJob(user.id, jobId)

        return {
          success: true,
          message: 'ジョブが再開されました',
          jobId,
          timestamp: new Date().toISOString(),
        }
      }).pipe(Effect.provide(JobServiceLive))
    })(request)

    // Add security headers to the response
    return addSecurityHeaders(result)
  } catch (error) {
    if (error instanceof ApiError) {
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
