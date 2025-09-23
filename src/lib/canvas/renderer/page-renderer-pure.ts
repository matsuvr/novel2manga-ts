import type { DialogueSegmentsPipeline } from '@/services/application/rendering/assets/dialogue-segments-pipeline'
import type { MangaLayout } from '@/types/panel-layout'
import { drawBasicBubble, drawPanelFrame, fillBackgroundWhite } from '../core/draw-primitives'
import { measureTextWidthCached } from '../metrics/measure-text-cache'

export interface PurePageRenderConfig {
  dialogue: { font: string; lineHeight: number; bubblePadding: number; maxBubbleWidthPx: number }
  sfx: { font: string; lineSpacing: number; fillStyle: string }
}

export const defaultPurePageRenderConfig: PurePageRenderConfig = {
  dialogue: { font: '14px "Noto Sans JP"', lineHeight: 18, bubblePadding: 8, maxBubbleWidthPx: 320 },
  sfx: { font: 'bold 20px "Noto Sans JP"', lineSpacing: 24, fillStyle: 'rgba(0,0,0,0.7)' },
}

export interface PurePageRenderInput {
  layout: MangaLayout
  pageNumber: number
  width: number
  height: number
  segmentsPipeline?: DialogueSegmentsPipeline
  clearBackground?: boolean
}

interface PanelBox { x: number; y: number; w: number; h: number }

export function renderPagePure(ctx: CanvasRenderingContext2D, input: PurePageRenderInput, cfg: PurePageRenderConfig = defaultPurePageRenderConfig) {
  if (input.clearBackground !== false) {
    fillBackgroundWhite(ctx, input.width, input.height)
  }
  const page = input.layout.pages.find(p => p.page_number === input.pageNumber)
  if (!page) throw new Error(`Page ${input.pageNumber} not found`)
  for (const panel of page.panels) {
    const x = panel.position.x * input.width
    const y = panel.position.y * input.height
    const w = panel.size.width * input.width
    const h = panel.size.height * input.height
    drawPanelFrame(ctx, x, y, w, h)
    renderPanelDialogues(ctx, panel, { x, y, w, h }, cfg, input.segmentsPipeline)
    renderPanelSfx(ctx, panel, { x, y, w, h }, cfg)
  }
}

function renderPanelDialogues(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: PurePageRenderConfig,
  pipeline?: DialogueSegmentsPipeline,
) {
  if (!panel.dialogues || panel.dialogues.length === 0) return
  const { lineHeight, bubblePadding, maxBubbleWidthPx, font } = cfg.dialogue
  const maxBubbleWidth = Math.min(box.w * 0.9, maxBubbleWidthPx)
  let offsetY = box.y + bubblePadding
  ctx.font = font
  for (const d of panel.dialogues) {
    const text = d.text
    if (!text) continue
    const phraseLines = pipeline ? pipeline.getSegments(text) : [text]
    const measured: string[] = []
    let current = ''
    for (const segment of phraseLines) {
      const tentative = current + segment
        if (measureTextWidthCached(ctx, tentative) > maxBubbleWidth - bubblePadding * 2 && current !== '') {
        measured.push(current)
        current = segment
      } else {
        current = tentative
      }
    }
    if (current) measured.push(current)
    const lines = measured
    const bubbleHeight = lines.length * lineHeight + bubblePadding * 2
    const bubbleWidth = Math.min(
      maxBubbleWidth,
        Math.max(...lines.map(l => measureTextWidthCached(ctx, l))) + bubblePadding * 2,
    )
    const bubbleX = box.x + (box.w - bubbleWidth) / 2
    const bubbleY = offsetY
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.strokeStyle = '#000'
    drawBasicBubble(ctx as unknown as import('../core/draw-primitives').Basic2DContext, { x: bubbleX, y: bubbleY, width: bubbleWidth, height: bubbleHeight, type: d.type || 'speech' })
    ctx.fillStyle = '#000'
    let ty = bubbleY + bubblePadding + lineHeight * 0.8
    for (const line of lines) {
      ctx.fillText(line, bubbleX + bubblePadding, ty)
      ty += lineHeight
    }
    offsetY += bubbleHeight + 4
    if (offsetY > box.y + box.h) break
  }
}

function renderPanelSfx(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: PurePageRenderConfig,
) {
  if (!panel.sfx || panel.sfx.length === 0) return
  ctx.font = cfg.sfx.font
  let sfxOffsetY = box.y + 4
  for (const s of panel.sfx) {
    if (!s) continue
    ctx.fillStyle = cfg.sfx.fillStyle
    ctx.fillText(s, box.x + 6, sfxOffsetY + 18)
    sfxOffsetY += cfg.sfx.lineSpacing
    if (sfxOffsetY > box.y + box.h) break
  }
}
