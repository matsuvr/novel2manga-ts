import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GET } from '@/app/api/jobs/[jobId]/status/route'
import { db } from '@/services/database'

vi.mock('@/services/database', async () => {
  const actual = await vi.importActual('@/services/database')
  return {
    ...actual,
    db: {
      jobs: vi.fn().mockReturnValue({
        getJob: vi.fn(),
      }),
      render: vi.fn().mockReturnValue({
        getPerEpisodeRenderProgress: vi.fn(),
        getAllRenderStatusByJob: vi.fn(),
      }),
    },
  }
})

describe('/api/jobs/[jobId]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正常系: 既存ジョブのステータスを返す(200)', async () => {
    const jobId = 'job-ok'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    const mockJob = {
      id: jobId,
      novelId: 'novel-1',
      status: 'processing',
      currentStep: 'analyze',
      totalChunks: 10,
      processedChunks: 3,
    }
    vi.mocked(db.jobs).mockReturnValue({ getJob: vi.fn().mockResolvedValue(mockJob) } as any)
    vi.mocked(db.render().getPerEpisodeRenderProgress).mockResolvedValue({})

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.job).toBeDefined()
    expect(data.job.id).toBe(jobId)
  })

  it('不存在: ジョブが無い場合は404', async () => {
    const jobId = 'job-missing'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    vi.mocked(db.jobs).mockReturnValue({ getJob: vi.fn().mockResolvedValue(null) } as any)

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(404)
    expect(data.error).toBe('ジョブが見つかりません')
  })

  it('DB例外: getJobDetails が例外を投げた場合は500とDBエラーメッセージ', async () => {
    const jobId = 'job-db-error'
    const request = new NextRequest(`http://localhost:3000/api/jobs/${jobId}/status`)

    vi.mocked(db.jobs).mockReturnValue({
      getJob: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    } as any)

    const res = await GET(request, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(500)
    expect(data.error).toBe('DB connection failed')
    expect(data.details).toBe('DB connection failed')
  })

  it('無効ID: jobId が undefined 文字列の場合は400', async () => {
    const request = new NextRequest('http://localhost:3000/api/jobs/undefined/status')

    const res = await GET(request, { params: { jobId: 'undefined' } })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('ジョブIDが指定されていません')
  })
})
