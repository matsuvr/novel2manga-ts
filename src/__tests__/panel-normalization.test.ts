import { describe, expect, it } from 'vitest'
import type { NewMangaScript } from '@/types/script'
import { normalizePanelIndices, withNormalizedPanels } from '@/utils/panel-normalization'

function makeScript(panelNos: number[]): NewMangaScript {
  return {
    style_tone: 'test',
    style_art: 'test',
    style_sfx: 'test',
    characters: [],
    locations: [],
    props: [],
    panels: panelNos.map((no) => ({
      no,
      cut: `cut-${no}`,
      camera: 'MS',
      narration: [],
      dialogue: [],
      sfx: [],
      importance: 1,
    })),
    continuity_checks: [],
  }
}

describe('panel-normalization', () => {
  it('keeps already normalized panels unchanged', () => {
    const script = makeScript([1, 2, 3])
    const { script: normalized, changed } = withNormalizedPanels(script)
    expect(changed).toBe(false)
    expect(normalized.panels.map((p) => p.no)).toEqual([1, 2, 3])
  })

  it('removes gaps and renumbers sequentially', () => {
    const script = makeScript([1, 3, 7])
    const { panels, mapping, changed } = normalizePanelIndices(script)
    expect(changed).toBe(true)
    expect(panels.map((p) => p.no)).toEqual([1, 2, 3])
    expect(mapping).toEqual([
      { originalIndex: 1, normalizedIndex: 1 },
      { originalIndex: 3, normalizedIndex: 2 },
      { originalIndex: 7, normalizedIndex: 3 },
    ])
  })

  it('drops duplicates keeping first occurrence', () => {
    const script = makeScript([1, 2, 2, 3])
    const { panels, changed } = normalizePanelIndices(script)
    expect(changed).toBe(true)
    expect(panels.map((p) => p.no)).toEqual([1, 2, 3])
  })

  it('drops invalid (<=0) indices', () => {
    const script = makeScript([0, -1, 2])
    const { panels, changed } = normalizePanelIndices(script)
    expect(changed).toBe(true)
    // Remaining valid index 2 becomes 1
    expect(panels.map((p) => p.no)).toEqual([1])
  })

  it('maintains original order (stability) independent of numeric value', () => {
    const script = makeScript([10, 5, 8])
    const { panels } = normalizePanelIndices(script)
    expect(panels.map((p) => p.no)).toEqual([1, 2, 3])
    // Ensure textual data preserved
    expect(panels[0].cut).toBe('cut-10')
    expect(panels[1].cut).toBe('cut-5')
  })
})
