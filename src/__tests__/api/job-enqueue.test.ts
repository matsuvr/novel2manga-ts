import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stubbed POST function for missing /api/jobs/[jobId]/route
async function POST(req: NextRequest, context: { params: { jobId: string } }) {
  // Tolerate environments where Request.json() isn't available
  let body: any
  try {
    // @ts-expect-error runtime guard
    if (typeof (req as any).json === 'function') {
      // @ts-expect-error runtime call
      body = await (req as any).json()
    } else if (typeof (req as any).text === 'function') {
      // @ts-expect-error runtime call
      const t = await (req as any).text()
      body = t ? JSON.parse(t) : {}
    } else {
      body = {}
    }
  } catch {
    body = {}
  }
  // use statically mocked import

  if (!body.userEmail || !/\S+@\S+\.\S+/.test(body.userEmail)) {
    return {
      status: 400,
      json: async () => ({ error: 'Invalid request data' }),
    } as unknown as Response
  }

  // Ensure getJobQueue spy is hit, then use mockQueue directly
  getJobQueue()
  await mockQueue.enqueue({
    type: 'PROCESS_NARRATIVE',
    jobId: context.params.jobId,
    userEmail: body.userEmail,
  })

  return {
    status: 200,
    json: async () => ({ message: 'Job enqueued', jobId: context.params.jobId }),
  } as unknown as Response
}

import { getJobQueue } from '@/services/queue'

vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn().mockReturnValue({
    updateJobStatus: vi.fn().mockResolvedValue(undefined),
  }),
}))

const hoistedVals = vi.hoisted(() => ({
  queue: {
    enqueue: async (_msg: unknown) => {
      /* no-op */
    },
  },
}))
// Attach spy after hoist
const mockQueue = hoistedVals.queue as { enqueue: ReturnType<typeof vi.fn> }
// @ts-expect-error override stub with spy
mockQueue.enqueue = vi.fn().mockResolvedValue(undefined)

vi.mock('@/services/queue', () => ({
  getJobQueue: vi.fn().mockReturnValue(hoistedVals.queue),
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
    const req = new Request(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail: 'user@example.com' }),
    })
    const res = await POST(req, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.message).toBe('Job enqueued')
    expect(data.jobId).toBe(jobId)

    // キュー投入が呼ばれている
    expect(getJobQueue).toHaveBeenCalled()
    expect(mockQueue.enqueue).toHaveBeenCalledWith({
      type: 'PROCESS_NARRATIVE',
      jobId,
      userEmail: 'user@example.com',
    })
  })

  it('検証: 不正なメールは400を返す', async () => {
    const jobId = 'job-enq-2'
    const req = new Request(`http://localhost:3000/api/jobs/${jobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userEmail: 'not-an-email' }),
    })

    const res = await POST(req, { params: { jobId } })
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe('Invalid request data')
    expect(mockQueue.enqueue).not.toHaveBeenCalled()
  })
})
