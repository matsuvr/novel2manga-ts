import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockJobService = {
  getJob: vi.fn(),
}

vi.mock('@/utils/api-auth', () => ({
  withAuth: (handler: any) => handler,
}))

vi.mock('@/services/application/job-details', () => ({
  getJobDetails: vi.fn(),
}))

vi.mock('@/services/database', () => ({
  db: {
    jobs: () => mockJobService,
  },
}))

const jobDetailsModule = await import('@/services/application/job-details')
const { GET } = await import('@/app/api/jobs/[jobId]/status/route')

beforeEach(() => {
  vi.clearAllMocks()
  mockJobService.getJob.mockResolvedValue(null)
})

describe('/api/jobs/[jobId]/status', () => {
  const user = { id: 'user-1' }

  it('returns 404 when job does not exist', async () => {
    mockJobService.getJob.mockResolvedValueOnce(null)

    const request = new NextRequest('http://localhost/api/jobs/missing/status')
    const response = await GET(request, user as any, { params: { jobId: 'missing' } })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Job not found')
  })

  it('returns 500 when job status retrieval fails', async () => {
    mockJobService.getJob.mockResolvedValueOnce({ id: 'job-err', userId: user.id })
    vi.mocked(jobDetailsModule.getJobDetails).mockRejectedValueOnce(new Error('DB connection failed'))

    const request = new NextRequest('http://localhost/api/jobs/job-err/status')
    const response = await GET(request, user as any, { params: { jobId: 'job-err' } })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to fetch job status')
    expect(json.details).toContain('DB connection failed')
  })
})
