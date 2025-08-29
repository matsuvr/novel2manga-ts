import type { PageBreakPlan, PageBreakV2 } from '@/types/script'

export function toLegacyPageBreak(v2: PageBreakV2): PageBreakPlan {
  // Group panels by pageNumber and sort
  const map = new Map<number, PageBreakPlan['pages'][0]>()
  for (const p of v2.panels) {
    const page = map.get(p.pageNumber) || {
      pageNumber: p.pageNumber,
      panelCount: 0,
      panels: [],
    }
    page.panels.push({
      panelIndex: p.panelIndex,
      content: p.content,
      dialogue: (p.dialogue || []).map((d) => ({ speaker: d.speaker, text: d.text })),
    })
    map.set(p.pageNumber, page)
  }
  const pages = Array.from(map.values())
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((pg) => ({ ...pg, panelCount: pg.panels.length }))
  return { pages }
}
