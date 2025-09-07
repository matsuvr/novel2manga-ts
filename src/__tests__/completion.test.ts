import { describe, expect, it } from 'vitest'
import { isRenderCompletelyDone, type JobStatusLite } from '@/utils/completion'

describe('isRenderCompletelyDone', () => {
  it('returns false when status is not completed', () => {
    const job: JobStatusLite = { status: 'processing', totalPages: 10, renderedPages: 10 }
    expect(isRenderCompletelyDone(job)).toBe(false)
  })

  it('returns true when status completed and pages match', () => {
    const job: JobStatusLite = { status: 'completed', totalPages: 5, renderedPages: 5 }
    expect(isRenderCompletelyDone(job)).toBe(true)
  })

  it('returns false when status completed but pages do not match', () => {
    const job: JobStatusLite = { status: 'completed', totalPages: 8, renderedPages: 7 }
    expect(isRenderCompletelyDone(job)).toBe(false)
  })

  it('falls back to per-episode totals when job totals are 0', () => {
    const job: JobStatusLite = {
      status: 'complete',
      totalPages: 0,
      renderedPages: 0,
      progress: {
        perEpisodePages: {
          '1': { rendered: 3, total: 3 },
          '2': { rendered: 2, total: 2 },
        },
      },
    }
    expect(isRenderCompletelyDone(job)).toBe(true)
  })

  it('does not use per-episode when totals are missing (cannot prove complete)', () => {
    const job: JobStatusLite = {
      status: 'completed',
      totalPages: 0,
      renderedPages: 0,
      progress: {
        perEpisodePages: {
          '1': { rendered: 3 },
        },
      },
    }
    expect(isRenderCompletelyDone(job)).toBe(false)
  })

  it('allows renderCompleted only as last fallback when totals not available', () => {
    const job: JobStatusLite = {
      status: 'completed',
      renderCompleted: true,
      totalPages: 0,
      renderedPages: 0,
    }
    expect(isRenderCompletelyDone(job)).toBe(true)
  })
})
