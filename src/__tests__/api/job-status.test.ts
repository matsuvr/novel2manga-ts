import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockJobService = {
  getJob: vi.fn(),
}

vi.mock('@/utils/api-auth', () => ({
  withAuth: (handler: any) => handler,
  getAuthenticatedUser: vi.fn(),
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
const authModule = await import('@/utils/api-auth')
const { GET } = await import('@/app/api/jobs/[jobId]/status/route')

beforeEach(() => {
  vi.clearAllMocks()
  mockJobService.getJob.mockResolvedValue(null)
  // 認証をモック - 非プロダクション環境でanonymousユーザーとして実行される想定
  vi.mocked(authModule.getAuthenticatedUser).mockRejectedValue(new Error('Auth not available'))
})

describe('/api/jobs/[jobId]/status', () => {
  it('returns 404 when job does not exist', async () => {
    mockJobService.getJob.mockResolvedValueOnce(null)

    const request = new NextRequest('http://localhost/api/jobs/missing/status')
    const response = await GET(request, { params: Promise.resolve({ jobId: 'missing' }) })
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Job not found')
  })

  it('returns 500 when job status retrieval fails', async () => {
    // userIdがnullのジョブで認証をスキップ
    mockJobService.getJob.mockResolvedValueOnce({ id: 'job-err', userId: null })
    vi.mocked(jobDetailsModule.getJobDetails).mockRejectedValueOnce(new Error('DB connection failed'))

    const request = new NextRequest('http://localhost/api/jobs/job-err/status')
    const response = await GET(request, { params: Promise.resolve({ jobId: 'job-err' }) })
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Failed to fetch job status')
    expect(json.details).toContain('DB connection failed')
  })
})
