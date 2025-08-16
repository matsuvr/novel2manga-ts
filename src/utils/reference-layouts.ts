import type { Panel } from '@/types/panel-layout'

// Embedded reference page panel geometries (positions/sizes only)
// Derived from docs/panel_layout_sample*.yaml and layout-templates

type RefPage = { page_number: number; panels: Panel[] }

function makePanels(shapes: Array<{ x: number; y: number; w: number; h: number }>): Panel[] {
  return shapes.map((s, idx) => ({
    id: `ref-${idx + 1}`,
    position: { x: s.x, y: s.y },
    size: { width: s.w, height: s.h },
    content: '',
    sourceChunkIndex: 0,
    importance: 5,
  }))
}

// 1 panel full page
const ref1: RefPage = {
  page_number: 1,
  panels: makePanels([{ x: 0, y: 0, w: 1, h: 1 }]),
}

// 2 panels vertical split (asymmetric)
const ref2: RefPage = {
  page_number: 1,
  panels: makePanels([
    { x: 0, y: 0, w: 1, h: 0.4 },
    { x: 0, y: 0.4, w: 1, h: 0.6 },
  ]),
}

// 3 panels from sample
const ref3: RefPage = {
  page_number: 1,
  panels: makePanels([
    { x: 0.52, y: 0.05, w: 0.48, h: 0.25 },
    { x: 0.0, y: 0.05, w: 0.5, h: 0.48 },
    { x: 0.0, y: 0.53, w: 1.0, h: 0.47 },
  ]),
}

// 4 panels narrative flow
const ref4: RefPage = {
  page_number: 1,
  panels: makePanels([
    { x: 0.5, y: 0.05, w: 0.5, h: 0.55 },
    { x: 0.0, y: 0.05, w: 0.5, h: 0.2 },
    { x: 0.0, y: 0.25, w: 0.5, h: 0.35 },
    { x: 0.0, y: 0.6, w: 1.0, h: 0.4 },
  ]),
}

// 5 panels emotion focus
const ref5: RefPage = {
  page_number: 1,
  panels: makePanels([
    { x: 0.52, y: 0.05, w: 0.48, h: 0.25 },
    { x: 0.0, y: 0.05, w: 0.5, h: 0.48 },
    { x: 0.0, y: 0.3, w: 0.5, h: 0.23 },
    { x: 0.0, y: 0.53, w: 1.0, h: 0.2 },
    { x: 0.0, y: 0.73, w: 1.0, h: 0.27 },
  ]),
}

// 6 panels conversation
const ref6: RefPage = {
  page_number: 1,
  panels: makePanels([
    { x: 0.53, y: 0.05, w: 0.47, h: 0.23 },
    { x: 0.0, y: 0.05, w: 0.48, h: 0.45 },
    { x: 0.0, y: 0.5, w: 0.48, h: 0.18 },
    { x: 0.53, y: 0.28, w: 0.47, h: 0.27 },
    { x: 0.35, y: 0.55, w: 0.5, h: 0.18 },
    { x: 0.0, y: 0.73, w: 1.0, h: 0.27 },
  ]),
}

export const referencePages: RefPage[] = [ref1, ref2, ref3, ref4, ref5, ref6]
