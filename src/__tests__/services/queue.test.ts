import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDatabaseService } from '@/services/db-factory'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { getNotificationService } from '@/services/notifications'
import { __resetJobQueueForTest, getJobQueue } from '@/services/queue'

vi.mock('@/services/job-narrative-processor', () => ({
  JobNarrativeProcessor: vi.fn().mockImplementation(() => ({
    processJob: vi.fn().mockResolvedValue(undefined),
  })),
}))

vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn().mockReturnValue({
    updateJobError: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('@/services/notifications', () => ({
  getNotificationService: vi.fn().mockReturnValue({
    sendJobCompletionEmail: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('JobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // @ts-expect-error test shim
    globalThis.JOBS_QUEUE = undefined
    __resetJobQueueForTest()
  })

  it('getJobQueue: throws when JOBS_QUEUE is undefined', async () => {
    expect(() => getJobQueue()).toThrow(/JOBS_QUEUE binding is not configured/)
  })

  it('getJobQueue: returns Cloudflare-backed queue when JOBS_QUEUE is available', async () => {
    __resetJobQueueForTest()
    // @ts-expect-error test shim
    globalThis.JOBS_QUEUE = { send: vi.fn().mockResolvedValue(undefined) }
    const queue = getJobQueue()
    await queue.enqueue({ type: 'PROCESS_NARRATIVE', jobId: 'job-4' })
    // @ts-expect-error test shim
    expect(globalThis.JOBS_QUEUE.send).toHaveBeenCalledWith({
      type: 'PROCESS_NARRATIVE',
      jobId: 'job-4',
    })
  })
})
