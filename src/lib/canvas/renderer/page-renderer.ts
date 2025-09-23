import type { MangaLayout } from '@/types/panel-layout'
import { createCanvas } from '../core/canvas-init'
import { drawPanelFrame, fillBackgroundWhite } from '../core/draw-primitives'

export interface PageRenderInput {
  layout: MangaLayout
  pageNumber: number
  width: number
  height: number
}

/**
 * Extremely thin initial facade. For now it only draws panel frames (no dialogues/SFX) to allow
 * incremental rollout. We will progressively migrate logic from legacy CanvasRenderer.
 */
export function renderPageToCanvas(input: PageRenderInput) {
  const canvas = createCanvas(input.width, input.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2d context')
  fillBackgroundWhite(ctx, input.width, input.height)
  const page = input.layout.pages.find(p => p.page_number === input.pageNumber)
  if (!page) throw new Error(`Page ${input.pageNumber} not found`)
  for (const panel of page.panels) {
    const x = panel.position.x * input.width
    const y = panel.position.y * input.height
    const w = panel.size.width * input.width
    const h = panel.size.height * input.height
    drawPanelFrame(ctx, x, y, w, h)
  }
  return canvas
}
