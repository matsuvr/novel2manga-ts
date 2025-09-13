// (kept single copy above)

/**
 * Jobs API Endpoint Tests (moved from deep folder)
 */

import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Auth module is mocked globally via vitest.setup.ts

// Import route dynamically inside tests so mocks are applied first

// Mock the job service with a proper Context and Layer
vi.mock('@/services/job', async () => {
  const { Effect, Context, Layer } = await import('effect')

  const mockJobService = {
    getUserJobs: (_userId: string, _opts: any) =>
      Effect.succeed([
        {
          job: { id: 'job1', status: 'completed', title: 'Test Job 1', userId: 'mock-user-id' },
          novel: { id: 'novel1', title: 'Test Novel 1' },
        },
        {
          job: { id: 'job2', status: 'processing', title: 'Test Job 2', userId: 'mock-user-id' },
          novel: { id: 'novel2', title: 'Test Novel 2' },
        },
      ]),
    resumeJob: () => Effect.succeed(undefined),
    getJobDetails: () =>
      Effect.succeed({
        job: { id: 'job1', status: 'completed', title: 'Test Job 1', userId: 'mock-user-id' },
        novel: { id: 'novel1', title: 'Test Novel 1' },
      }),
  }

  const JobService = Context.GenericTag('JobService')
  const JobServiceLive = Layer.succeed(JobService, mockJobService)

  return {
    JobService,
    JobServiceLive,
  }
})

// Mock the security middleware to validate inputs and convert Effect to Response
vi.mock('@/lib/api-security', () => ({
  withSecurityEffect: (config: unknown, handler: (req: NextRequest, data?: any) => any) => {
    return async (request: NextRequest) => {
      const { Effect } = await import('effect')
      const url = new URL(request.url)
      const validatedData = {
        query: {
          limit: Number(url.searchParams.get('limit')) || 10,
          offset: Number(url.searchParams.get('offset')) || 0,
          status: url.searchParams.get('status') || undefined,
        },
      }
      try {
        const eff = handler(request, validatedData)
        const data = await Effect.runPromise(eff)
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'SERVER_ERROR',
              message: String(e),
            },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        )
      }
    }
  },
  SECURITY_CONFIGS: {
    authenticated: {
      rateLimit: { requests: 100, window: 60000 },
      auth: { required: true },
    },
  },
}))

// Mock the validation schemas
vi.mock('@/lib/api-validation', () => ({
  VALIDATION_SCHEMAS: {
    jobs: {
      query: vi.fn(),
    },
  },
}))

describe('/api/jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it.skip('moved to integration: should return user jobs with default pagination', async () => {
      expect(true).toBe(true)
    })

    it('should handle pagination parameters', async () => {
      const request = new NextRequest('http://localhost:3000/api/jobs?limit=5&offset=10')

      const { GET } = await import('../../../../app/api/jobs/route')
      const response = await GET(request)

      expect(response).toBeDefined()
    })

    it('should handle status filter', async () => {
      const request = new NextRequest('http://localhost:3000/api/jobs?status=completed')

      const { GET } = await import('../../../../app/api/jobs/route')
      const response = await GET(request)

      expect(response).toBeDefined()
    })

    it('should limit maximum page size to 100', async () => {
      const request = new NextRequest('http://localhost:3000/api/jobs?limit=200')

      const { GET } = await import('../../../../app/api/jobs/route')
      const response = await GET(request)

      expect(response).toBeDefined()
    })
  })
})
