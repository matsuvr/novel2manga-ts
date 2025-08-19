import { describe, expect, it } from 'vitest'
import { isMangaLayout, validateMangaLayout } from '@/utils/type-guards'

describe('type-guards: isMangaLayout', () => {
  it('returns false for non-object', () => {
    expect(isMangaLayout(null)).toBe(false)
    expect(isMangaLayout(123)).toBe(false)
    expect(isMangaLayout('str')).toBe(false)
  })

  it('returns true for minimal valid layout', () => {
    const layout = {
      title: 't',
      created_at: '2024-01-01',
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 'scene1',
              position: { x: 0, y: 0 },
              size: { width: 1, height: 1 },
              content: 'desc',
            },
          ],
        },
      ],
    }
    expect(isMangaLayout(layout)).toBe(true)
  })

  it('validateMangaLayout returns errors for missing pages', () => {
    const invalid = { title: 't', created_at: '2024-01-01', episodeNumber: 1 }
    const res = validateMangaLayout(invalid)
    expect(res.valid).toBe(false)
    if (!res.valid) {
      expect(res.errors.some((e) => e.includes('pages'))).toBe(true)
    }
  })
})
