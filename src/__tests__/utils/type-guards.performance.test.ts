import { describe, expect, it } from 'vitest'
import { isMangaLayout } from '@/utils/type-guards'

// Minimal fixture
const baseLayout = {
  title: 'Episode 1',
  created_at: new Date().toISOString(),
  episodeNumber: 1,
  pages: [
    {
      page_number: 1,
      panels: [
        {
          id: 'scene1',
          position: { x: 0, y: 0 },
          size: { width: 1, height: 1 },
          content: 'test',
        },
      ],
    },
  ],
}

describe('isMangaLayout caching', () => {
  it('returns true consistently and benefits from cache on repeated calls', () => {
    // warm
    expect(isMangaLayout(baseLayout)).toBe(true)
    // subsequent calls should be true (cannot directly assert perf without benchmark, but ensures no mutation side-effects)
    for (let i = 0; i < 5; i++) {
      expect(isMangaLayout(baseLayout)).toBe(true)
    }
  })

  it('rejects clearly invalid object fast', () => {
    expect(isMangaLayout({})).toBe(false)
    expect(isMangaLayout(null)).toBe(false)
    expect(isMangaLayout(undefined)).toBe(false)
  })
})
