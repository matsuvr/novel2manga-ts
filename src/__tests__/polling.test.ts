import { describe, expect, it } from 'vitest'
import { decideNextPollingAction, type JobStatusLite } from '@/utils/polling'

describe('decideNextPollingAction', () => {
  it('continues when renderCompleted is true but status is not completed', () => {
    const job: JobStatusLite = { renderCompleted: true, status: 'processing' }
    expect(decideNextPollingAction(job, 0)).toBe('continue')
  })

  it('redirects when status is completed', () => {
    const job: JobStatusLite = { status: 'completed' }
    expect(decideNextPollingAction(job, 0)).toBe('redirect')
  })

  it('continues when failed has not reached threshold', () => {
    const job: JobStatusLite = { status: 'failed' }
    expect(decideNextPollingAction(job, 0, 3)).toBe('continue')
    expect(decideNextPollingAction(job, 1, 3)).toBe('continue')
  })

  it('stops when failed reaches threshold', () => {
    const job: JobStatusLite = { status: 'failed' }
    expect(decideNextPollingAction(job, 2, 3)).toBe('stop_failed')
  })

  it('resets failure streak on non-failed and continues', () => {
    const job: JobStatusLite = { status: 'processing' }
    expect(decideNextPollingAction(job, 10, 3)).toBe('continue')
  })
})
