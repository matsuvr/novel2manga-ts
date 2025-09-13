/**
 * Job Details API Endpoint
 * GET /api/jobs/[jobId] - Get detailed information about a specific job
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

export async function GET(request: NextRequest, { params }: RouteParams) {
  // Apply security measures manually for route with params
  const { applyRateLimit } = await import('@/lib/rate-limiting')
  const { addSecurityHeaders } = await import('@/lib/api-security')

  try {
    // Apply rate limiting (no-op if undefined)
    applyRateLimit(request, SECURITY_CONFIGS.authenticated.rateLimit)

    const result = await withAuth((user) => {
      const { jobId } = params

      if (!jobId || typeof jobId !== 'string' || jobId.trim().length === 0) {
        return Effect.fail(new ApiError('VALIDATION_ERROR', 'Job ID is required', 400))
      }

      return Effect.gen(function* () {
        const jobService = yield* JobService
        const jobWithNovel = yield* jobService.getJobDetails(user.id, jobId)

        return {
          data: jobWithNovel,
          metadata: {
            timestamp: new Date().toISOString(),
          },
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
