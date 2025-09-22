import { describe, expect, it } from 'vitest'
import {
  analyzeImportanceDistribution,
  calculateImportanceBasedPageBreaks,
  validateScriptImportance
} from '@/agents/script/importance-based-page-break'
import type { NewMangaScript } from '@/types/script'

describe('importance-based page breaks', () => {
  const buildScript = (importances: number[]): NewMangaScript => ({
    style_tone: '',
    style_art: '',
    style_sfx: '',
    characters: [],
    locations: [],
    props: [],
    continuity_checks: [],
    panels: importances.map((importance, idx) => ({
      no: idx + 1,
      cut: `CUT ${idx + 1}`,
      camera: `CAM ${idx + 1}`,
      dialogue: [],
      narration: [],
      importance,
    })),
  })

  it('maps dialogue speaker/text and narration, and combines cut/camera into content', () => {
    const script: NewMangaScript = {
      style_tone: '',
      style_art: '',
      style_sfx: '',
      characters: [],
      locations: [],
      props: [],
      continuity_checks: [],
      panels: [
        {
          no: 1,
          cut: 'CUT: 屋上',
          camera: 'CAM: 俯瞰',
          narration: ['「夕日が沈む」'],
          dialogue: [{ type: 'speech', speaker: '太郎', text: '今日も終わりだな' }],
          sfx: ['ゴォォ'],
          importance: 3,
        },
        {
          no: 2,
          cut: 'CUT: 太郎の顔',
          camera: 'CAM: ズームイン',
          narration: [],
          dialogue: [{ type: 'speech', speaker: '花子', text: 'そうね' }],
          sfx: [],
          importance: 3,
        },
      ],
    }

    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)
    expect(pageBreaks.panels.length).toBe(2)
    const p1 = pageBreaks.panels[0]
    expect(p1.content).toBe('CUT: 屋上\nCAM: 俯瞰')
    expect(p1.dialogue?.[0]).toEqual({ speaker: '太郎', text: '今日も終わりだな', type: 'speech' })
    expect(p1.dialogue?.[1]).toEqual({
      speaker: 'ナレーション',
      text: '夕日が沈む',
      type: 'narration',
    })

    const p2 = pageBreaks.panels[1]
    expect(p2.content).toBe('CUT: 太郎の顔\nCAM: ズームイン')
    expect(p2.dialogue?.[0]).toEqual({ speaker: '花子', text: 'そうね', type: 'speech' })
  })

  // Updated test to match new logic
  it('keeps adding panels until reaching 6 or more', () => {
    const script = buildScript([5, 5])

    const { pageBreaks, stats } = calculateImportanceBasedPageBreaks(script)
    const pages = pageBreaks.panels.map((panel) => panel.pageNumber)

  // New logic: both panels go to page 1 since 5+5=10 (≥6)
  expect(pages).toEqual([1, 1])
  expect(stats.totalPages).toBe(1)
  // lastPageTotalImportance はキャリー用の残余(または飽和時は LIMIT)ではなく、新仕様では
  // 飽和したページの residual を 0 としないため、10%6=4 の残余を返す実装となっている。
  expect(stats.lastPageTotalImportance).toBe(4)
  })

  it('groups panels correctly when sum equals page limit', () => {
    const script = buildScript([3, 3, 2])

    const { pageBreaks, stats } = calculateImportanceBasedPageBreaks(script)
    const pages = pageBreaks.panels.map((panel) => panel.pageNumber)

    // 3+3=6 (page limit), so both go to page 1, then page resets for panel 3
    expect(pages).toEqual([1, 1, 2])
    expect(stats.totalPages).toBe(2)
    expect(stats.lastPageTotalImportance).toBe(2)
  })

  // New test for the specific example case mentioned
  it('handles the example case [4,1,2,2,1,2,5] correctly', () => {
    const script = buildScript([4, 1, 2, 2, 1, 2, 5])
    const result = calculateImportanceBasedPageBreaks(script)

    const panelsByPage = new Map<number, number[]>()
    for (const panel of result.pageBreaks.panels) {
      if (!panelsByPage.has(panel.pageNumber)) {
        panelsByPage.set(panel.pageNumber, [])
      }
      panelsByPage.get(panel.pageNumber)!.push(panel.panelIndex)
    }

    // Trace through the new logic:
    // Panel 1 (importance=4): sum=4, page 1
    // Panel 2 (importance=1): sum=5, page 1
    // Panel 3 (importance=2): sum=7 (≥6), page 1, then reset for next page
    // Panel 4 (importance=2): sum=2, page 2
    // Panel 5 (importance=1): sum=3, page 2
    // Panel 6 (importance=2): sum=5, page 2
    // Panel 7 (importance=5): sum=10 (≥6), page 2

    expect(panelsByPage.get(1)).toEqual([1, 2, 3]) // panels 1,2,3 (4+1+2=7)
    expect(panelsByPage.get(2)).toEqual([4, 5, 6, 7]) // panels 4,5,6,7 (2+1+2+5=10)

    expect(result.stats.totalPages).toBe(2)
    expect(result.stats.totalPanels).toBe(7)
  })

  it('handles single high-importance panel', () => {
    const script = buildScript([6]) // exactly the limit
    const result = calculateImportanceBasedPageBreaks(script)

    expect(result.pageBreaks.panels).toHaveLength(1)
    expect(result.pageBreaks.panels[0].pageNumber).toBe(1)
    expect(result.stats.totalPages).toBe(1)
  })

  it('includes initialImportance when determining saturation (carry 4 + panel 2)', () => {
    const script = buildScript([2, 3])
    // Start with a carry of 4, first panel (importance 2) should saturate page (4+2=6) → next panel on new page
    const { pageBreaks, stats } = calculateImportanceBasedPageBreaks(script, 4)
    const pages = pageBreaks.panels.map(p => p.pageNumber)
    expect(pages).toEqual([1, 2])
    // lastPageTotalImportance: last page has only panel importance 3 (not saturated)
    expect(stats.lastPageTotalImportance).toBe(3)
    expect(stats.carryIntoNewPage).toBe(false)
  })

  // Regression guard: requested logic
  // Sum importance values sequentially; once cumulative >= 6, close the page with those panels.
  // Example sequence 1,2,2,3,4,6,6 => [[1,2,2,3],[4,6],[6]]
  it('groups [1,2,2,3,4,6,6] into pages [[1,2,2,3],[4,6],[6]]', () => {
    const importances = [1, 2, 2, 3, 4, 6, 6]
    const script = buildScript(importances)
    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)

    const pages: Record<number, number[]> = {}
    for (const p of pageBreaks.panels) {
      pages[p.pageNumber] ||= []
      pages[p.pageNumber].push(p.panelIndex)
    }

    expect(pages[1]).toEqual([1, 2, 3, 4]) // 1+2+2+3=8 >=6
    expect(pages[2]).toEqual([5, 6]) // 4+6=10 >=6
    expect(pages[3]).toEqual([7]) // 6 >=6
    // Ensure no extra pages created
    expect(Object.keys(pages).length).toBe(3)
  })

  it('handles empty script', () => {
    const script = buildScript([])
    const result = calculateImportanceBasedPageBreaks(script)

    expect(result.pageBreaks.panels).toHaveLength(0)
    expect(result.stats.totalPages).toBe(0)
    expect(result.stats.totalPanels).toBe(0)
  })
})

describe('validateScriptImportance', () => {
  const buildScript = (importances: number[]): NewMangaScript => ({
    style_tone: '',
    style_art: '',
    style_sfx: '',
    characters: [],
    locations: [],
    props: [],
    continuity_checks: [],
    panels: importances.map((importance, idx) => ({
      no: idx + 1,
      cut: `CUT ${idx + 1}`,
      camera: `CAM ${idx + 1}`,
      dialogue: [],
      narration: [],
      importance,
    })),
  })

  it('should validate correct importance values', () => {
    const script = buildScript([1, 3, 6, 2])
    const result = validateScriptImportance(script)

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
    expect(result.correctedPanels).toBe(0)
  })

  it('should detect and report invalid values', () => {
    const script = buildScript([0, 7, -1, 10])
    const result = validateScriptImportance(script)

    expect(result.valid).toBe(false)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.correctedPanels).toBe(4)
  })
})

describe('analyzeImportanceDistribution', () => {
  const buildScript = (importances: number[]): NewMangaScript => ({
    style_tone: '',
    style_art: '',
    style_sfx: '',
    characters: [],
    locations: [],
    props: [],
    continuity_checks: [],
    panels: importances.map((importance, idx) => ({
      no: idx + 1,
      cut: `CUT ${idx + 1}`,
      camera: `CAM ${idx + 1}`,
      dialogue: [],
      narration: [],
      importance,
    })),
  })

  it('should correctly analyze distribution', () => {
    const script = buildScript([1, 1, 2, 3, 3, 3])
    const result = analyzeImportanceDistribution(script)

    expect(result.totalPanels).toBe(6)
    expect(result.distribution[1]).toBe(2)
    expect(result.distribution[2]).toBe(1)
    expect(result.distribution[3]).toBe(3)
    expect(result.averageImportance).toBe(2.17) // (1+1+2+3+3+3)/6 = 13/6 ≈ 2.17
    expect(result.estimatedPages).toBe(3) // ceil(13/6) = 3
  })
})
