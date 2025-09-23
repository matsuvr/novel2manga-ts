import { describe, expect, it, vi } from 'vitest'
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import type { NewMangaScript } from '@/types/script'

describe('segmented page break estimator', () => {
  it('carries importance across segments', async () => {
    const script: NewMangaScript = {
      style_tone: '',
      style_art: '',
      style_sfx: '',
      characters: [],
      locations: [],
      props: [],
      continuity_checks: [],
      panels: [
        { no: 1, cut: 'c1', camera: 'cam1', importance: 3, dialogue: [], narration: [] },
        { no: 2, cut: 'c2', camera: 'cam2', importance: 2, dialogue: [], narration: [] },
        { no: 3, cut: 'c3', camera: 'cam3', importance: 1, dialogue: [], narration: [] },
        { no: 4, cut: 'c4', camera: 'cam4', importance: 4, dialogue: [], narration: [] },
      ],
    }

    vi.stubEnv('NODE_ENV', 'development')

    const result = await estimatePageBreaksSegmented(script, {
      forceSegmentation: true,
      segmentationConfig: {
        maxPanelsPerSegment: 2,
        minPanelsForSegmentation: 2,
        contextOverlapPanels: 0,
      },
    })

    const pages = result.pageBreaks.panels.map((p) => p.pageNumber)
    expect(pages).toEqual([1, 1, 1, 2])
  })

  it('does not split early incorrectly: panels before reaching 6 stay on same page (allowing segmentation carry reset)', async () => {
      const buildPanel = (no: number, cut: string, importance: number) => ({
        no,
        cut,
        camera: `cam-${no}`,
        importance,
        dialogue: [],
        narration: [],
      })
      const baseScript: NewMangaScript = {
        style_tone: '',
        style_art: '',
        style_sfx: '',
        characters: [],
        locations: [],
        props: [],
        continuity_checks: [],
        panels: [],
      }
      // Construct a script with panels that would total <6 if taken together but may be split
      const panels = [
        buildPanel(1, 'A', 2),
        buildPanel(2, 'B', 1),
        buildPanel(3, 'C', 1), // total so far 4 (<6) should stay same page
        buildPanel(4, 'D', 3), // now 7 -> page break after this one
      ]
      const script = { ...baseScript, panels }

      // Force segmentation by providing small maxPanelsPerSegment
      const result = await estimatePageBreaksSegmented(script, {
        forceSegmentation: true,
        segmentationConfig: { maxPanelsPerSegment: 2, minPanelsForSegmentation: 2, contextOverlapPanels: 0 },
      })
      const pages: Record<number, number[]> = {}
      for (const p of result.pageBreaks.panels) {
        pages[p.pageNumber] ||= []
        pages[p.pageNumber].push(p.panelIndex)
      }
      // Invariant: any non-final page must have cumulative original importance >=6
      // Reconstruct using original importance values
      const original = panels
      const pageImportance: Record<number, number> = {}
      for (const [pgStr, arr] of Object.entries(pages)) {
        const pg = Number(pgStr)
        pageImportance[pg] = arr.reduce((s, panelIndex) => s + original[panelIndex - 1].importance, 0)
      }
      const maxPage = Math.max(...Object.keys(pages).map(Number))
      for (const [pgStr, imp] of Object.entries(pageImportance)) {
        const pg = Number(pgStr)
        if (pg === maxPage) continue
        expect(imp).toBeGreaterThanOrEqual(6)
      }
    })

  it('residual carry (open page) correctly continues into next segment', async () => {
    // Segment1 panels importance: 2 + 2 =4 (<6) -> open page residual=4
    // Segment2 begins with carry=4 then panel importance 2 -> saturates (4+2=6)
    // Next panel starts new page
    const script: NewMangaScript = {
      style_tone: '', style_art: '', style_sfx: '', characters: [], locations: [], props: [], continuity_checks: [],
      panels: [
        { no:1, cut:'s1p1', camera:'c', importance:2, dialogue:[], narration:[] },
        { no:2, cut:'s1p2', camera:'c', importance:2, dialogue:[], narration:[] },
        { no:3, cut:'s2p1', camera:'c', importance:2, dialogue:[], narration:[] }, // closes page (residual 0)
        { no:4, cut:'s2p2', camera:'c', importance:3, dialogue:[], narration:[] }, // new page accum=3
        { no:5, cut:'s2p3', camera:'c', importance:3, dialogue:[], narration:[] }, // accum=6 closes
      ],
    }
    const result = await estimatePageBreaksSegmented(script, {
      forceSegmentation: true,
      segmentationConfig: { maxPanelsPerSegment: 2, minPanelsForSegmentation: 2, contextOverlapPanels: 0 },
    })
    const pages = result.pageBreaks.panels.map(p=>p.pageNumber)
    // First three panels same page, next two same next page
    expect(pages).toEqual([1,1,1,2,2])
  })

  it('saturated boundary resets residual so next segment starts fresh', async () => {
    // Segment1: 3 + 3 = 6 (saturated) -> residual=0
    // Segment2 should start fresh and not inherit 6
    const script: NewMangaScript = {
      style_tone: '', style_art: '', style_sfx: '', characters: [], locations: [], props: [], continuity_checks: [],
      panels: [
        { no:1, cut:'a', camera:'c', importance:3, dialogue:[], narration:[] },
        { no:2, cut:'b', camera:'c', importance:3, dialogue:[], narration:[] }, // saturates
        { no:3, cut:'c', camera:'c', importance:2, dialogue:[], narration:[] }, // new page starts sum=2
        { no:4, cut:'d', camera:'c', importance:4, dialogue:[], narration:[] }, // sum=6 closes
        { no:5, cut:'e', camera:'c', importance:1, dialogue:[], narration:[] }, // page3 sum=1
      ],
    }
    const result = await estimatePageBreaksSegmented(script, {
      forceSegmentation: true,
      segmentationConfig: { maxPanelsPerSegment: 2, minPanelsForSegmentation: 2, contextOverlapPanels: 0 },
    })
    const pages = result.pageBreaks.panels.map(p=>p.pageNumber)
    expect(pages).toEqual([1,1,2,2,3])
    // Invariant check: non-final pages (1,2) importance >=6
    const original = script.panels
    const byPage: Record<number, number[]> = {}
    result.pageBreaks.panels.forEach(p => { (byPage[p.pageNumber] ||= []).push(p.panelIndex) })
    const maxPage = Math.max(...Object.keys(byPage).map(Number))
    for (const [pgStr, idxs] of Object.entries(byPage)) {
      const pg = Number(pgStr)
      if (pg === maxPage) continue
      const sum = idxs.reduce((s,i)=> s + (original[i-1].importance||1),0)
      expect(sum).toBeGreaterThanOrEqual(6)
    }
  })
})
