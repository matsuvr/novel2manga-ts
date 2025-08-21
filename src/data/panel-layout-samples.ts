// Build-time bundled panel layout samples to avoid runtime fs dependency
// Imports JSON from public/docs and exposes typed accessors.

// JSON files contain objects like { "page_XX": { panels_count, panels: [...] } }
// We normalize them to the internal PanelLayout shape used by renderer utilities.

export interface PanelLayout {
  panels_count: number
  panels: Array<{
    id: number
    bbox: [number, number, number, number]
    content: string
    dialogue: string
  }>
}

type RawPage = { panels_count: number; panels: PanelLayout['panels'] }
type RawJson = Record<string, RawPage>

function toPanelLayout(raw: RawJson): PanelLayout {
  const firstKey = Object.keys(raw)[0]
  const page = firstKey ? raw[firstKey] : undefined
  if (!page) throw new Error('Invalid panel layout JSON: missing page key')
  return { panels_count: page.panels_count, panels: page.panels }
}

// 1 panel
import p1_1 from '../../public/docs/panel_layout_sample/1/1panel_sample.json'

// 2 panels
import p2_1 from '../../public/docs/panel_layout_sample/2/2panels_sample1.json'
import p2_2 from '../../public/docs/panel_layout_sample/2/2panels_sample2.json'

// 3 panels
import p3_1 from '../../public/docs/panel_layout_sample/3/3panels_sample1.json'
import p3_2 from '../../public/docs/panel_layout_sample/3/3panels_sample2.json'
import p3_3 from '../../public/docs/panel_layout_sample/3/3panels_sample3.json'
import p3_4 from '../../public/docs/panel_layout_sample/3/3panels_sample4.json'
import p3_5 from '../../public/docs/panel_layout_sample/3/3panels_sample5.json'
import p3_6 from '../../public/docs/panel_layout_sample/3/3panels_sample6.json'

// 4 panels
import p4_1 from '../../public/docs/panel_layout_sample/4/4panels_sample1.json'
import p4_2 from '../../public/docs/panel_layout_sample/4/4panels_sample2.json'
import p4_3 from '../../public/docs/panel_layout_sample/4/4panels_sample3.json'
import p4_4 from '../../public/docs/panel_layout_sample/4/4panels_sample4.json'
import p4_5 from '../../public/docs/panel_layout_sample/4/4panels_sample5.json'
import p4_6 from '../../public/docs/panel_layout_sample/4/4panels_sample6.json'
import p4_7 from '../../public/docs/panel_layout_sample/4/4panels_sample7.json'
import p4_8 from '../../public/docs/panel_layout_sample/4/4panels_sample8.json'
import p4_9 from '../../public/docs/panel_layout_sample/4/4panels_sample9.json'
import p4_10 from '../../public/docs/panel_layout_sample/4/4panels_sample10.json'
import p4_11 from '../../public/docs/panel_layout_sample/4/4panels_sample11.json'

// 5 panels
import p5_1 from '../../public/docs/panel_layout_sample/5/5panels_sample1.json'
import p5_2 from '../../public/docs/panel_layout_sample/5/5panels_sample2.json'
import p5_3 from '../../public/docs/panel_layout_sample/5/5panels_sample3.json'
import p5_4 from '../../public/docs/panel_layout_sample/5/5panels_sample4.json'

// 6 panels
import p6_1 from '../../public/docs/panel_layout_sample/6/6panels_sample1.json'
import p6_2 from '../../public/docs/panel_layout_sample/6/6panels_sample2.json'
import p6_3 from '../../public/docs/panel_layout_sample/6/6panels_sample3.json'

const layoutsByCount: Record<number, PanelLayout[]> = {
  1: [toPanelLayout(p1_1 as unknown as RawJson)],
  2: [toPanelLayout(p2_1 as unknown as RawJson), toPanelLayout(p2_2 as unknown as RawJson)],
  3: [
    toPanelLayout(p3_1 as unknown as RawJson),
    toPanelLayout(p3_2 as unknown as RawJson),
    toPanelLayout(p3_3 as unknown as RawJson),
    toPanelLayout(p3_4 as unknown as RawJson),
    toPanelLayout(p3_5 as unknown as RawJson),
    toPanelLayout(p3_6 as unknown as RawJson),
  ],
  4: [
    toPanelLayout(p4_1 as unknown as RawJson),
    toPanelLayout(p4_2 as unknown as RawJson),
    toPanelLayout(p4_3 as unknown as RawJson),
    toPanelLayout(p4_4 as unknown as RawJson),
    toPanelLayout(p4_5 as unknown as RawJson),
    toPanelLayout(p4_6 as unknown as RawJson),
    toPanelLayout(p4_7 as unknown as RawJson),
    toPanelLayout(p4_8 as unknown as RawJson),
    toPanelLayout(p4_9 as unknown as RawJson),
    toPanelLayout(p4_10 as unknown as RawJson),
    toPanelLayout(p4_11 as unknown as RawJson),
  ],
  5: [
    toPanelLayout(p5_1 as unknown as RawJson),
    toPanelLayout(p5_2 as unknown as RawJson),
    toPanelLayout(p5_3 as unknown as RawJson),
    toPanelLayout(p5_4 as unknown as RawJson),
  ],
  6: [
    toPanelLayout(p6_1 as unknown as RawJson),
    toPanelLayout(p6_2 as unknown as RawJson),
    toPanelLayout(p6_3 as unknown as RawJson),
  ],
}

export function getRandomPanelLayout(panelCount: number): PanelLayout {
  const list = layoutsByCount[panelCount] || []
  if (list.length === 0) {
    throw new Error(`No panel layout samples found for ${panelCount} panels`)
  }
  const idx = Math.floor(Math.random() * list.length)
  return list[idx]
}
