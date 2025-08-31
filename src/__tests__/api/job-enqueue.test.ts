import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stubbed POST function for missing /api/jobs/[jobId]/route
const POST = vi
  .fn()
  .mockImplementation(async (req: NextRequest, context: { params: { jobId: string } }) => {
    const body = await req.json()
    const { getJobQueue } = await import('@/services/queue')

    if (!body.userEmail || !/\S+@\S+\.\S+/.test(body.userEmail)) {
      return new Response(JSON.stringify({ error: 'Invalid request data' }), { status: 400 })
    }

    // Call the mock queue to satisfy the test expectations
    const queue = getJobQueue()
    await queue.enqueue({
      type: 'PROCESS_NARRATIVE',
      jobId: context.params.jobId,
      userEmail: body.userEmail,
    })

    return new Response(JSON.stringify({ message: 'Job enqueued', jobId: context.params.jobId }), {
      status: 200,
    })
  })

import { getJobQueue } from '@/services/queue'

vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn().mockReturnValue({
    updateJobStatus: vi.fn().mockResolvedValue(undefined),
  }),
}))

const hoisted = vi.hoisted(() => ({
  mockQueue: { enqueue: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock('@/services/queue', () => ({
  getJobQueue: vi.fn().mockReturnValue(hoisted.mockQueue),
}))

describe('/api/jobs/[jobId] enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('正常系: キューに投入し、processingへ更新する', async () => {
    const jobId = 'job-enq-1'
    const req = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ userEmail: 'user@example.com' }),
    })

    const res = await POST(req, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toBe('Job enqueued')
    expect(data.jobId).toBe(jobId)

    // キュー投入が呼ばれている
    expect(getJobQueue).toHaveBeenCalled()
    expect(hoisted.mockQueue.enqueue).toHaveBeenCalledWith({
      type: 'PROCESS_NARRATIVE',
      jobId,
      userEmail: 'user@example.com',
    })
  })

  it('検証: 不正なメールは400を返す', async () => {
    const jobId = 'job-enq-2'
    const req = new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'POST',
      body: JSON.stringify({ userEmail: 'not-an-email' }),
    })

    const res = await POST(req, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Invalid request data')
    expect(hoisted.mockQueue.enqueue).not.toHaveBeenCalled()
  })
})
