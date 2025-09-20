import { describe, expect, it } from 'vitest'
import { mergePerEpisodeRenderProgress } from '@/services/database/render-database-service'

describe('mergePerEpisodeRenderProgress', () => {
  it('prefers layout totals when available', () => {
    const result = mergePerEpisodeRenderProgress(
      [{ episodeNumber: 2, rendered: 3 }],
      [{ episodeNumber: 2, total: 10 }],
    )

    expect(result[2]).toEqual({ planned: 10, rendered: 3, total: 10 })
  })

  it('falls back to rendered counts when layout totals are missing', () => {
    const result = mergePerEpisodeRenderProgress(
      [{ episodeNumber: 5, rendered: 4 }],
      [],
    )

    expect(result[5]).toEqual({ planned: 4, rendered: 4, total: 4 })
  })

  it('keeps layout entry with zero rendered pages', () => {
    const result = mergePerEpisodeRenderProgress(
      [],
      [{ episodeNumber: 7, total: 12 }],
    )

    expect(result[7]).toEqual({ planned: 12, rendered: 0, total: 12 })
  })
})
