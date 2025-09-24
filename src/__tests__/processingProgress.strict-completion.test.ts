import { describe, expect, it } from 'vitest'
import { isRenderCompletelyDone } from '@/utils/completion'

// This test ensures UI side now relies on strict completion (all pages rendered) not just renderCompleted flag

describe('Strict completion behavior', () => {
  it('does not treat renderCompleted=true alone as done when status incomplete', () => {
    const job = { status: 'processing', renderCompleted: true, totalPages: 10, renderedPages: 9 }
    expect(isRenderCompletelyDone(job)).toBe(false)
  })
  it('treats full page coverage with status completed as done', () => {
    const job = { status: 'completed', totalPages: 3, renderedPages: 3 }
    expect(isRenderCompletelyDone(job)).toBe(true)
  })
  it('treats per-episode totals when aggregate missing', () => {
    const job = { status: 'completed', totalPages: 0, renderedPages: 0, progress: { perEpisodePages: { '1': { total: 2, rendered: 2 }, '2': { total: 1, rendered: 1 } } } }
    expect(isRenderCompletelyDone(job)).toBe(true)
  })
})
