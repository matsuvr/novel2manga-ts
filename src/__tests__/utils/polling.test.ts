import { describe, expect, it } from 'vitest'
import { decideNextPollingAction, type JobStatusLite } from '@/utils/polling'

describe('decideNextPollingAction', () => {
  it('redirects only when status is completed/complete', () => {
    const job1: JobStatusLite = { status: 'completed', renderCompleted: true }
    const job2: JobStatusLite = { status: 'complete', renderCompleted: false }
    const job3: JobStatusLite = { status: 'processing', renderCompleted: true }

    expect(decideNextPollingAction(job1, 0)).toBe('redirect')
    expect(decideNextPollingAction(job2, 0)).toBe('redirect')
    expect(decideNextPollingAction(job3, 0)).toBe('continue')
  })

  it('continues when pending/processing and not failed', () => {
    expect(decideNextPollingAction({ status: 'pending' }, 0)).toBe('continue')
    expect(decideNextPollingAction({ status: 'processing' }, 1)).toBe('continue')
  })

  it('stops after reaching failed threshold', () => {
    const job: JobStatusLite = { status: 'failed' }
    expect(decideNextPollingAction(job, 0, 2)).toBe('continue')
    expect(decideNextPollingAction(job, 1, 2)).toBe('stop_failed')
  })
})
