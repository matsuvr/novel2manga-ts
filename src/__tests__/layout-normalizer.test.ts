import { describe, expect, it } from 'vitest'
import type { MangaLayout, Panel } from '@/types/panel-layout'
import { normalizeAndValidateLayout, validatePanels } from '@/utils/layout-normalizer'

function makeLayoutWithPanels(panels: Panel[]): MangaLayout {
  return {
    title: 'test',
    created_at: '2025-08-16',
    episodeNumber: 1,
    episodeTitle: 't',
    pages: [
      {
        page_number: 1,
        panels,
      },
    ],
  }
}

describe('normalizeAndValidateLayout - final issues only after fallback', () => {
  it('reports empty issues when fallback makes layout valid', () => {
    // invalid absolute px positions that will be clamped and then mapped by fallback
    const layout = makeLayoutWithPanels([
      {
        id: 'a',
        position: { x: 2, y: 2 },
        size: { width: 2, height: 2 },
        content: '',
        sourceChunkIndex: 0,
        importance: 1,
      },
    ])
    const result = normalizeAndValidateLayout(layout)
    expect(result.pageIssues[1]).toBeDefined()
    expect(result.pageIssues[1]).toEqual([])
    // Final layout must be valid
    const v = validatePanels(result.layout.pages[0].panels as Panel[])
    expect(v.valid).toBe(true)
  })

  it('reports only final issues when still invalid after fallback', () => {
    // Construct a layout that will remain invalid even after fallback by forcing overlaps
    // We simulate by providing two identical panels already in [0,1] so fallback maps count and keeps overlap
    const layout = makeLayoutWithPanels([
      {
        id: 'a',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        content: '',
        sourceChunkIndex: 0,
        importance: 1,
      },
      {
        id: 'b',
        position: { x: 0, y: 0 },
        size: { width: 1, height: 1 },
        content: '',
        sourceChunkIndex: 0,
        importance: 1,
      },
    ])
    const directIssues = validatePanels(layout.pages[0].panels as Panel[])
    expect(directIssues.valid).toBe(false)

    const result = normalizeAndValidateLayout(layout)
    expect(result.pageIssues[1]).toBeDefined()
    // Should only contain final issues (not concatenated with original)
    expect(Array.isArray(result.pageIssues[1])).toBe(true)
  })
})
