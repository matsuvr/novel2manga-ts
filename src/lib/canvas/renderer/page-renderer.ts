import type { MangaLayout } from '@/types/panel-layout'
import { createCanvas, ensureCanvasInited } from '../core/canvas-init'
import { drawBasicBubble, drawPanelFrame, fillBackgroundWhite } from '../core/draw-primitives'

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
  // Ensure font & canvas one-time initialization (fixes native binding complaining about undefined -> String)
  ensureCanvasInited()
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

    // Dialogue bubbles (very naive layout: stack vertically inside panel)
    if (panel.dialogues && panel.dialogues.length > 0) {
      const lineHeightPx = 18
      const bubblePadding = 8
      const maxBubbleWidth = Math.min(w * 0.9, 320)
      let offsetY = y + bubblePadding
      for (const d of panel.dialogues) {
        const text = d.text
        if (!text) continue
        const lines: string[] = []
        // Simple word wrap (split by spaces/Japanese chars heuristically)
        const tokens = text.split(/\s+/)
        let current = ''
        ctx.font = '14px "Noto Sans JP"'
        for (const tk of tokens) {
          const test = current.length === 0 ? tk : `${current} ${tk}`
          if (ctx.measureText(test).width > maxBubbleWidth - bubblePadding * 2) {
            if (current.length > 0) lines.push(current)
            current = tk
          } else {
            current = test
          }
        }
        if (current.length > 0) lines.push(current)
        const bubbleHeight = lines.length * lineHeightPx + bubblePadding * 2
        const bubbleWidth = Math.min(
          maxBubbleWidth,
          Math.max(...lines.map(l => ctx.measureText(l).width)) + bubblePadding * 2,
        )
        const bubbleX = x + (w - bubbleWidth) / 2
        const bubbleY = offsetY
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.strokeStyle = '#000'
        drawBasicBubble(ctx, { x: bubbleX, y: bubbleY, width: bubbleWidth, height: bubbleHeight, type: d.type || 'speech' })
        ctx.fillStyle = '#000'
        let ty = bubbleY + bubblePadding + lineHeightPx * 0.8
        for (const line of lines) {
          ctx.fillText(line, bubbleX + bubblePadding, ty)
          ty += lineHeightPx
        }
        offsetY += bubbleHeight + 4
        if (offsetY > y + h) break // overflow guard
      }
    }

    // SFX rendering (simple overlay top-left inside panel, stacked)
    if (panel.sfx && panel.sfx.length > 0) {
      let sfxOffsetY = y + 4
      ctx.font = 'bold 20px "Noto Sans JP"'
      for (const s of panel.sfx) {
        if (!s) continue
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillText(s, x + 6, sfxOffsetY + 18)
        sfxOffsetY += 24
        if (sfxOffsetY > y + h) break
      }
    }
  }
  return canvas
}
