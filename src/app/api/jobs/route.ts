/**
 * Job Management API Endpoints
 * GET /api/jobs - List user's jobs with pagination and filtering
 */

import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { SECURITY_CONFIGS, withSecurityEffect } from '@/lib/api-security'
import { requireAuth } from '@/server/auth'
import { JobService, JobServiceLive } from '@/services/job'

export const GET = withSecurityEffect(
  {
    ...SECURITY_CONFIGS.authenticated,
    validation: {
      query: {
        limit: { type: 'number', min: 1, max: 100 },
        offset: { type: 'number', min: 0 },
        status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
      },
    },
  },
  (
    _request: NextRequest,
    validatedData?: { query?: { limit?: number; offset?: number; status?: string } },
  ) =>
    Effect.gen(function* () {
      const limit = validatedData?.query?.limit ?? 10
      const offset = validatedData?.query?.offset ?? 0
      const status = validatedData?.query?.status ?? undefined

      const user = yield* requireAuth
      const jobService = yield* JobService
      const jobs = yield* jobService.getUserJobs(user.id, {
        limit,
        offset,
        status,
      })

      return {
        data: jobs,
        metadata: { limit, offset, status, timestamp: new Date().toISOString() },
      }
    }).pipe(Effect.provide(JobServiceLive)),
)
