/**
 * Job Resume API Endpoint Tests (moved)
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the authentication and job service
vi.mock('@/server/auth/effectToApiResponse', async () => {
  const { Effect } = await import('effect')
  class ApiError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
      public details?: unknown,
    ) {
      super(message)
    }
  }
  return {
    withAuth:
      (handler: (user: { id: string; email?: string }) => any) => async (_request: Request) => {
        const mockUser = { id: 'user1', email: 'test@example.com' }
        const eff = handler(mockUser)
        try {
          const data = await Effect.runPromise(eff as any)
          return new Response(JSON.stringify({ data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          if (error instanceof ApiError) {
            return new Response(
              JSON.stringify({
                error: { code: error.code, message: error.message, details: error.details },
              }),
              { status: error.status, headers: { 'Content-Type': 'application/json' } },
            )
          }
          return new Response(
            JSON.stringify({ error: { code: 'SERVER_ERROR', message: String(error) } }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    ApiError,
  }
})

vi.mock('@/services/job', async () => {
  const { Effect, Context, Layer } = await import('effect')
  const mockJobService = {
    resumeJob: (_userId: string, _jobId: string) => Effect.succeed(undefined),
  }
  const JobService = Context.GenericTag('JobService')
  const JobServiceLive = Layer.succeed(JobService, mockJobService)
  return { JobService, JobServiceLive }
})

describe('/api/jobs/[jobId]/resume', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST', () => {
    it('should resume job for valid job ID', async () => {
      const request = new NextRequest('http://localhost:3000/api/jobs/job1/resume', {
        method: 'POST',
      })
      const params = { params: { jobId: 'job1' } }

      const { POST } = await import('@/app/api/jobs/[jobId]/resume/route')
      const response = await POST(request, params)

      expect(response).toBeDefined()
    })
  })
})
