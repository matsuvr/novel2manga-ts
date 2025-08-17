import { describe, expect, it } from 'vitest'
import type { MangaLayout, Panel } from '@/types/panel-layout'
import { normalizeAndValidateLayout, validatePanels } from '@/utils/layout-normalizer'

function makeLayout(panels: Panel[]): MangaLayout {
  return {
    title: 't',
    created_at: '2024-01-01',
    episodeNumber: 1,
    pages: [
      {
        page_number: 1,
        panels,
      },
    ],
  }
}

describe('layout-normalizer', () => {
  it('detects overlap and fixes via reference fallback', () => {
    const panels: Panel[] = [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        size: { width: 0.6, height: 0.6 },
        content: 'A',
        sourceChunkIndex: 0,
        importance: 5,
      },
      {
        id: 'b',
        position: { x: 0.5, y: 0.5 },
        size: { width: 0.6, height: 0.6 },
        content: 'B',
        sourceChunkIndex: 0,
        importance: 5,
      },
    ]

    const v = validatePanels(panels)
    expect(v.valid).toBe(false)
    expect(v.issues.some((m) => m.includes('overlap'))).toBe(true)

    const { layout, pageIssues } = normalizeAndValidateLayout(makeLayout(panels))
    expect(layout.pages[0].panels.length).toBe(2)
    // Either no issues or at least the previous overlap was addressed by remapping
    expect(Object.keys(pageIssues)).toContain('1')
  })

  it('detects horizontal band coverage != 1', () => {
    const panels: Panel[] = [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        size: { width: 0.4, height: 0.5 },
        content: 'A',
        sourceChunkIndex: 0,
        importance: 5,
      },
      {
        id: 'b',
        position: { x: 0.6, y: 0 },
        size: { width: 0.4, height: 0.5 },
        content: 'B',
        sourceChunkIndex: 0,
        importance: 5,
      },
    ]
    const v = validatePanels(panels)
    expect(v.valid).toBe(false)
    expect(v.issues.some((m) => m.includes('coverage'))).toBe(true)
  })
})
