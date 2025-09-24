import { appConfig } from '@/config/app.config'
import type { DialogueSegmentsPipeline } from '@/services/application/rendering/assets/dialogue-segments-pipeline'
import type { MangaLayout } from '@/types/panel-layout'
import { getDialogueAsset } from '../assets/dialogue-cache'
import { buildDialogueKey } from '../assets/dialogue-key'
import { createCanvas, ensureCanvasInited } from '../core/canvas-init'
import { drawBasicBubble, drawPanelFrame, fillBackgroundWhite } from '../core/draw-primitives'
import { measureTextWidthCached } from '../metrics/measure-text-cache'

export interface PageRenderInput {
  layout: MangaLayout
  pageNumber: number
  width: number
  height: number
  /**
   * 再利用対象の既存 Canvas を指定可能。
   * サイズが一致しない場合は無視して新規生成。
   */
  targetCanvas?: { width: number; height: number; getContext: (t: '2d') => CanvasRenderingContext2D | null }
}

/**
 * Extremely thin initial facade. For now it only draws panel frames (no dialogues/SFX) to allow
 * incremental rollout. We will progressively migrate logic from legacy CanvasRenderer.
 */
interface TextRenderConfig {
  dialogue: { font: string; lineHeight: number; bubblePadding: number; maxBubbleWidthPx: number }
  sfx: { font: string; lineSpacing: number; fillStyle: string }
}

const defaultTextConfig: TextRenderConfig = {
  dialogue: { font: '14px "Noto Sans JP"', lineHeight: 18, bubblePadding: 8, maxBubbleWidthPx: 320 },
  sfx: { font: 'bold 20px "Noto Sans JP"', lineSpacing: 24, fillStyle: 'rgba(0,0,0,0.7)' },
}

export interface PageRendererDeps {
  segmentsPipeline?: DialogueSegmentsPipeline
}

export function renderPageToCanvas(input: PageRenderInput, cfg: TextRenderConfig = defaultTextConfig, deps: PageRendererDeps = {}) {
  ensureCanvasInited()
  let reused = false
  let canvas: typeof input.targetCanvas | ReturnType<typeof createCanvas>
  if (input.targetCanvas && input.targetCanvas.width === input.width && input.targetCanvas.height === input.height) {
    canvas = input.targetCanvas as typeof input.targetCanvas
    reused = true
  } else {
    canvas = createCanvas(input.width, input.height)
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Failed to acquire 2d context')
  // 再利用時は状態をリセット（transform・スタイル・ピクセル）
  if (reused) {
    try { ctx.setTransform?.(1, 0, 0, 1, 0, 0) } catch { /* noop */ }
    ctx.clearRect(0, 0, input.width, input.height)
  }
  fillBackgroundWhite(ctx, input.width, input.height)
  const page = input.layout.pages.find(p => p.page_number === input.pageNumber)
  if (!page) throw new Error(`Page ${input.pageNumber} not found`)
  for (const panel of page.panels) {
    const x = panel.position.x * input.width
    const y = panel.position.y * input.height
    const w = panel.size.width * input.width
    const h = panel.size.height * input.height
    drawPanelFrame(ctx, x, y, w, h)

  renderPanelDialogues(ctx, panel, { x, y, w, h }, cfg, deps)
    renderPanelSfx(ctx, panel, { x, y, w, h }, cfg)
    renderPanelContent(ctx, panel, { x, y, w, h })
  }
  return canvas
}

interface PanelBox { x: number; y: number; w: number; h: number }

function renderPanelDialogues(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: TextRenderConfig,
  // 将来: segmentsPipeline など追加依存を使用するためのプレースホルダ
  _deps?: PageRendererDeps,
) {
  if (!panel.dialogues || panel.dialogues.length === 0) return
  const { bubblePadding, maxBubbleWidthPx, font } = cfg.dialogue
  let offsetY = box.y + bubblePadding
  ctx.font = font
  const vtDefaults = appConfig.rendering.verticalText.defaults
  for (const d of panel.dialogues) {
    const raw = d.text?.trim()
    if (!raw) continue
    // 1) 縦書き画像アセット lookup
    const key = buildDialogueKey({
      dialogue: d,
      fontSize: vtDefaults.fontSize,
      lineHeight: vtDefaults.lineHeight,
      letterSpacing: vtDefaults.letterSpacing,
      padding: vtDefaults.padding,
      maxCharsPerLine: vtDefaults.maxCharsPerLine,
    })
    const asset = getDialogueAsset(key)
    if (asset) {
      // 画像寸法を元に bubble を生成（左右中央配置）
      const bubbleWidth = Math.min(asset.width + bubblePadding * 2, Math.min(box.w * 0.9, maxBubbleWidthPx))
      const bubbleHeight = asset.height + bubblePadding * 2
      const bubbleX = box.x + (box.w - bubbleWidth) / 2
      const bubbleY = offsetY
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeStyle = '#000'
      drawBasicBubble(ctx as unknown as import('../core/draw-primitives').Basic2DContext, { x: bubbleX, y: bubbleY, width: bubbleWidth, height: bubbleHeight, type: d.type || 'speech' })
      // 画像を中央に配置
      const imgX = bubbleX + (bubbleWidth - asset.width) / 2
      const imgY = bubbleY + bubblePadding
      try {
        ctx.drawImage(asset.image as unknown as CanvasImageSource, imgX, imgY, asset.width, asset.height)
      } catch {
        // drawImage 失敗時はフォールバックテキスト
        // フォールバックテキスト（既にバブル描画済み）
        fallbackHorizontalText(
          ctx,
          raw,
          bubbleX,
          bubbleY,
          bubbleWidth,
            bubbleHeight,
          bubblePadding,
          font,
        )
      }
      offsetY += bubbleHeight + 6
      if (offsetY > box.y + box.h) break
      continue
    }
    // 2) フォールバック: 水平テキスト（従来ロジック簡素形）
    const fallbackFont = font
    const maxBubbleWidth = Math.min(box.w * 0.9, maxBubbleWidthPx)
    const lines = simpleWrapLines(ctx, raw, maxBubbleWidth - bubblePadding * 2)
    const lineHeight = vtDefaults.lineHeight // bubbleKey と整合
    const bubbleHeight = lines.length * lineHeight + bubblePadding * 2
    const bubbleWidth = Math.max(...lines.map(l => measureTextWidthCached(ctx, l)), 10) + bubblePadding * 2
    const bubbleX = box.x + (box.w - bubbleWidth) / 2
    const bubbleY = offsetY
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.strokeStyle = '#000'
    drawBasicBubble(ctx as unknown as import('../core/draw-primitives').Basic2DContext, { x: bubbleX, y: bubbleY, width: bubbleWidth, height: bubbleHeight, type: d.type || 'speech' })
    ctx.fillStyle = '#000'
    ctx.font = fallbackFont
    let ty = bubbleY + bubblePadding + lineHeight * 0.8
    for (const line of lines) {
      ctx.fillText(line, bubbleX + bubblePadding, ty)
      ty += lineHeight
    }
    offsetY += bubbleHeight + 6
    if (offsetY > box.y + box.h) break
  }
}

function simpleWrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const ch of text) {
    const tentative = current + ch
    if (ctx.measureText(tentative).width > maxWidth && current) {
      lines.push(current)
      current = ch
    } else {
      current = tentative
    }
  }
  if (current) lines.push(current)
  return lines
}

function fallbackHorizontalText(
  ctx: CanvasRenderingContext2D,
  text: string,
  bubbleX: number,
  bubbleY: number,
  bubbleWidth: number,
  bubbleHeight: number,
  padding: number,
  font: string,
) {
  ctx.font = font
  ctx.fillStyle = '#000'
  const lines = simpleWrapLines(ctx, text, bubbleWidth - padding * 2)
  const lineHeight = 18
  let ty = bubbleY + padding + lineHeight * 0.8
  for (const line of lines) {
    ctx.fillText(line, bubbleX + padding, ty)
    ty += lineHeight
    if (ty > bubbleY + bubbleHeight - padding) break
  }
}

function renderPanelSfx(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: TextRenderConfig,
) {
  if (!panel.sfx || panel.sfx.length === 0) return
  // Simple heuristic placement (improved SFX visibility vs 初期版)
  const baseFont =  Math.min( Math.max(24, box.h * 0.14), 56)
  let used = 0
  for (let i=0;i<panel.sfx.length;i++) {
    const raw = panel.sfx[i]
    if (!raw) continue
    const fontSize = Math.max(18, Math.round(baseFont * (1 - (i*0.12))))
    ctx.save()
    ctx.font = `bold ${fontSize}px "Noto Sans JP"`
    ctx.fillStyle = cfg.sfx.fillStyle
    // rotate a little bit for manga-like effect
    const rotation = [ -0.18, 0.12, -0.1, 0.15, 0 ][i % 5]
    const sx = box.x + 8 + (i%2===0 ? 0 : box.w*0.55)
    const sy = box.y + 12 + used
    ctx.translate(sx, sy)
    ctx.rotate(rotation)
    ctx.translate(-sx, -sy)
    ctx.lineWidth = 4
    ctx.strokeStyle = 'white'
    ctx.strokeText(raw, sx, sy)
    ctx.fillText(raw, sx, sy)
    ctx.restore()
    used += fontSize * 1.2
    if (sy + fontSize > box.y + box.h - 8) break
  }
}

function renderPanelContent(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
) {
  const text = panel.content?.trim()
  if (!text) return
  const maxWidth = box.w * 0.9
  const startX = box.x + box.w * 0.05
  const startY = box.y + box.h * 0.05
  const maxFont = Math.min(22, Math.max(14, Math.round(box.h * 0.05)))
  ctx.save()
  ctx.font = `${maxFont}px "Noto Sans JP"`
  ctx.fillStyle = 'rgba(0,0,0,0.85)'
  ctx.textBaseline = 'top'
  // simple char wrapping
  const lines: string[] = []
  let current = ''
  for (const ch of text.split('')) {
    const tentative = current + ch
    if (ctx.measureText(tentative).width > maxWidth && current) {
      lines.push(current)
      current = ch
    } else {
      current = tentative
    }
  }
  if (current) lines.push(current)
  let y = startY
  for (const line of lines.slice(0, 4)) { // clamp lines for lightweight renderer
    if (y > box.y + box.h * 0.6) break
    ctx.fillText(line, startX, y)
    y += maxFont * 1.2
  }
  ctx.restore()
}
