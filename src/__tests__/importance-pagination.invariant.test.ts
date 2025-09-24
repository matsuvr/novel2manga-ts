import { describe, expect, it } from 'vitest'
import { calculateImportanceBasedPageBreaks } from '@/agents/script/importance-based-page-break'
import type { NewMangaScript } from '@/types/script'

function buildScript(importances: number[]): NewMangaScript {
  return {
    style_tone: 't',
    style_art: 'a',
    style_sfx: 's',
    characters: [],
    locations: [],
    props: [],
    continuity_checks: [],
    panels: importances.map((importance, idx) => ({
      no: idx + 1,
      cut: `cut${idx + 1}`,
      camera: 'cam',
      narration: [],
      dialogue: [ { type: 'speech', speaker: 'S', text: `p${idx + 1}` } ],
      sfx: [],
      importance,
    })),
  }
}

describe('importance pagination (add-then-check legacy spec)', () => {
  it('4+1+2=7 までは同一ページ (limit 超過パネル含む)', () => {
    const script = buildScript([4,1,2,3]) // panel3で7>=6 となるので page1 を閉じ, panel4 から page2
    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)
    expect(pageBreaks.panels.map(p => p.pageNumber)).toEqual([1,1,1,2])
  })

  it('5,2 -> 両方同一ページ (5+2=7>=6) の後次パネルから新ページ', () => {
    const script = buildScript([5,2,1])
    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)
    expect(pageBreaks.panels.map(p=>p.pageNumber)).toEqual([1,1,2])
  })

  it('3,3 でちょうど6 -> その時点でページクローズし次パネル新ページ', () => {
    const script = buildScript([3,3,2])
    const { pageBreaks } = calculateImportanceBasedPageBreaks(script)
    expect(pageBreaks.panels.map(p=>p.pageNumber)).toEqual([1,1,2])
  })
})
