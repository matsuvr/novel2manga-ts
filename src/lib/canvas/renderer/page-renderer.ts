import { appConfig } from '@/config/app.config'
import type { DialogueSegmentsPipeline } from '@/services/application/rendering/assets/dialogue-segments-pipeline'
import type { MangaLayout } from '@/types/panel-layout'
import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'
import { getDialogueAsset } from '../assets/dialogue-cache'
import { buildDialogueKey } from '../assets/dialogue-key'
import { createCanvas, ensureCanvasInited } from '../core/canvas-init'
import { drawBasicBubble, drawPanelFrame, drawThoughtBubble, fillBackgroundWhite } from '../core/draw-primitives'
import { measureTextWidthCached } from '../metrics/measure-text-cache'
import { SfxPlacer } from '../sfx-placer'

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
 * Server-side facade for the new rendering pipeline. This module must never execute in a browser;
 * the rendering step runs inside workers/Node runtime only. Tests exercise it under happy-dom, so
 * browser-like globals are tolerated when NODE_ENV === 'test'.
 */
interface TextRenderConfig {
  dialogue: { font: string; lineHeight: number; bubblePadding: number; maxBubbleWidthPx: number }
  sfx: { font: string; lineSpacing: number; fillStyle: string }
}

const defaultTextConfig: TextRenderConfig = {
  dialogue: { font: '14px "Noto Sans JP"', lineHeight: 18, bubblePadding: 8, maxBubbleWidthPx: 320 },
  sfx: { font: 'bold 20px "Noto Sans JP"', lineSpacing: 24, fillStyle: 'rgba(0,0,0,0.7)' },
}

const HORIZONTAL_SLOT_COVERAGE = 0.9
const BUBBLE_COLUMN_GAP_RATIO = 0.01
const BUBBLE_TOP_OFFSET_RATIO = 0.2
const MAX_BUBBLE_AREA_HEIGHT_RATIO = 0.7
const PANEL_MARGIN_RATIO = 0.05
const MULTI_DIALOGUE_MAX_SPAN_RATIO = 0.6
const SINGLE_BUBBLE_MAX_WIDTH_RATIO = 0.45
const SINGLE_BUBBLE_MIN_HEIGHT = 60
const MIN_BUBBLE_HEIGHT = 30
const AVAILABLE_VERTICAL_MARGIN = 2

type Rect = { x: number; y: number; width: number; height: number }

const isBrowserContext = typeof window !== 'undefined' && typeof document !== 'undefined'
const isTestRuntime = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)
if (isBrowserContext && !isTestRuntime) {
  throw new Error('renderPageToCanvas is server-only. Remove unintended client-side rendering call.')
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

    const dialogueAreas = renderPanelDialogues(ctx, panel, { x, y, w, h }, cfg, deps)
    renderPanelSfx(ctx, panel, { x, y, w, h }, cfg, dialogueAreas)
    renderPanelContent(ctx, panel, { x, y, w, h })
  }
  return canvas
}

interface PanelBox { x: number; y: number; w: number; h: number }

type PanelDialogue = NonNullable<
  MangaLayout['pages'][number]['panels'][number]['dialogues']
>[number]

interface AssetRenderInfo {
  image: CanvasImageSource
  drawWidth: number
  drawHeight: number
}

interface FallbackRenderInfo {
  lines: string[]
  font: string
  lineHeight: number
  textWidth: number
  textHeight: number
}

interface DialogueRenderInstruction {
  dialogue: PanelDialogue
  bubbleX: number
  bubbleY: number
  bubbleWidth: number
  bubbleHeight: number
  asset?: AssetRenderInfo
  fallback?: FallbackRenderInfo
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

function updateFontSize(baseFont: string, size: number): string {
  if (!baseFont) return `${size}px "Noto Sans JP"`
  if (baseFont.includes('px')) {
    return baseFont.replace(/\d+(?:\.\d+)?px/, `${size}px`)
  }
  return `${size}px ${baseFont}`
}

function renderPanelDialogues(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: TextRenderConfig,
  // 将来: segmentsPipeline など追加依存を使用するためのプレースホルダ
  deps?: PageRendererDeps,
): Rect[] {
  if (!panel.dialogues || panel.dialogues.length === 0) return []
  const bubblePadding = cfg.dialogue.bubblePadding ?? 10
  const vtDefaults = appConfig.rendering.verticalText.defaults
  const panelBox: Rect = { x: box.x, y: box.y, width: box.w, height: box.h }
  const bubbleTop = box.y + box.h * BUBBLE_TOP_OFFSET_RATIO
  const maxBubbleAreaHeight = box.h * MAX_BUBBLE_AREA_HEIGHT_RATIO

  const instructions =
    panel.dialogues.length > 1
      ? layoutMultipleDialogues(
          ctx,
          panel.dialogues,
          panelBox,
          bubbleTop,
          maxBubbleAreaHeight,
          bubblePadding,
          cfg,
          vtDefaults,
          deps,
        )
      : layoutSingleDialogue(
          ctx,
          panel.dialogues[0],
          panelBox,
          bubbleTop,
          maxBubbleAreaHeight,
          bubblePadding,
          cfg,
          vtDefaults,
          deps,
        )

  const occupied: Rect[] = []
  const prevFill = ctx.fillStyle
  const prevStroke = ctx.strokeStyle
  const prevFont = ctx.font

  for (const inst of instructions) {
    const bubbleCfg = appConfig.rendering.canvas.bubble
    ctx.fillStyle = bubbleCfg.fillStyle || 'rgba(255,255,255,0.95)'
    ctx.strokeStyle = bubbleCfg.strokeStyle || '#000'
    ctx.lineWidth = bubbleCfg.normalLineWidth || 2
    const dialogueType = inst.dialogue.type || 'speech'
    if (dialogueType === 'thought') {
      drawThoughtBubble(
        ctx as unknown as import('../core/draw-primitives').Basic2DContext & { quadraticCurveTo: (...a: number[]) => void },
        inst.bubbleX,
        inst.bubbleY,
        inst.bubbleWidth,
        inst.bubbleHeight,
        {
          ...bubbleCfg.thoughtShape,
          tail: bubbleCfg.thoughtTail,
        },
      )
    } else {
      drawBasicBubble(ctx as unknown as import('../core/draw-primitives').Basic2DContext, {
        x: inst.bubbleX,
        y: inst.bubbleY,
        width: inst.bubbleWidth,
        height: inst.bubbleHeight,
        type: dialogueType,
      })
    }

    let rendered = false
    if (inst.asset) {
      const drawX = inst.bubbleX + (inst.bubbleWidth - inst.asset.drawWidth) / 2
      const drawY = inst.bubbleY + (inst.bubbleHeight - inst.asset.drawHeight) / 2
      try {
        ctx.drawImage(
          inst.asset.image as CanvasImageSource,
          drawX,
          drawY,
          inst.asset.drawWidth,
          inst.asset.drawHeight,
        )
        rendered = true
      } catch {
        // fall through to fallback text
      }
    }

    if (!rendered) {
      const text = inst.dialogue.text ?? ''
      if (!inst.fallback && text) {
        const maxContentWidth = Math.max(10, inst.bubbleWidth - bubblePadding * 2)
        const maxContentHeight = Math.max(10, inst.bubbleHeight - bubblePadding * 2)
        inst.fallback = buildFallbackText(
          ctx,
          text,
          maxContentWidth,
          maxContentHeight,
          cfg.dialogue.font,
          vtDefaults,
          deps,
        )
      }

      if (inst.fallback) {
        const prevLocalFont = ctx.font
        ctx.font = inst.fallback.font
        ctx.fillStyle = '#000'
        let ty = inst.bubbleY + bubblePadding + inst.fallback.lineHeight * 0.8
        for (const line of inst.fallback.lines) {
          ctx.fillText(line, inst.bubbleX + bubblePadding, ty)
          ty += inst.fallback.lineHeight
          if (ty > inst.bubbleY + inst.bubbleHeight - bubblePadding) break
        }
        ctx.font = prevLocalFont
      }
    }

    occupied.push({
      x: inst.bubbleX,
      y: inst.bubbleY,
      width: inst.bubbleWidth,
      height: inst.bubbleHeight,
    })
  }

  ctx.fillStyle = prevFill
  ctx.strokeStyle = prevStroke
  ctx.font = prevFont
  return occupied
}

function layoutMultipleDialogues(
  ctx: CanvasRenderingContext2D,
  dialogues: readonly PanelDialogue[],
  panelBox: Rect,
  bubbleTop: number,
  maxBubbleAreaHeight: number,
  bubblePadding: number,
  cfg: TextRenderConfig,
  vtDefaults: typeof appConfig.rendering.verticalText.defaults,
  deps?: PageRendererDeps,
): DialogueRenderInstruction[] {
  const instructions: DialogueRenderInstruction[] = []
  const count = dialogues.length
  const usableWidth = panelBox.width * HORIZONTAL_SLOT_COVERAGE
  const gap = panelBox.width * BUBBLE_COLUMN_GAP_RATIO
  const totalGap = gap * (count - 1)
  let slotWidth = Math.max(1, (usableWidth - totalGap) / Math.max(1, count))
  const maxSpanWidth = panelBox.width * MULTI_DIALOGUE_MAX_SPAN_RATIO
  const projectedSpan = slotWidth * count + totalGap
  if (projectedSpan > maxSpanWidth && maxSpanWidth > totalGap) {
    const compressedSlotWidth = (maxSpanWidth - totalGap) / count
    const minSlotWidth = bubblePadding * 2 + 20
    slotWidth = Math.max(minSlotWidth, compressedSlotWidth)
  }
  const rightEdgeStart =
    panelBox.x + panelBox.width - panelBox.width * PANEL_MARGIN_RATIO - slotWidth

  for (let logicalIndex = 0; logicalIndex < count; logicalIndex++) {
    const dialogue = dialogues[logicalIndex]
    const rawText = dialogue.text ?? ''
    const key = buildDialogueKey({
      dialogue,
      fontSize: vtDefaults.fontSize,
      lineHeight: vtDefaults.lineHeight,
      letterSpacing: vtDefaults.letterSpacing,
      padding: vtDefaults.padding,
      maxCharsPerLine: vtDefaults.maxCharsPerLine,
    })
    const asset = getDialogueAsset(key)
    const slotX = rightEdgeStart - (slotWidth + gap) * logicalIndex
    const slotRightEdge = slotX + slotWidth
    const maxContentWidth = Math.max(10, slotWidth - bubblePadding * 2)
    const maxContentHeight = Math.max(10, maxBubbleAreaHeight - bubblePadding * 2)

    if (asset) {
      const scale = Math.min(maxContentWidth / asset.width, maxContentHeight / asset.height, 1)
      const drawW = Math.max(1, asset.width * scale)
      const drawH = Math.max(1, asset.height * scale)
      const bubbleW = drawW + bubblePadding * 2
      const bubbleH = Math.max(MIN_BUBBLE_HEIGHT, drawH + bubblePadding * 2)
      const bx = clamp(slotRightEdge - bubbleW, panelBox.x, panelBox.x + panelBox.width - bubbleW)
      const maxBottom = panelBox.y + panelBox.height - AVAILABLE_VERTICAL_MARGIN
      let by = bubbleTop
      if (by + bubbleH > maxBottom) {
        by = Math.max(panelBox.y + PANEL_MARGIN_RATIO * panelBox.height, maxBottom - bubbleH)
      }
      instructions.push({
        dialogue,
        bubbleX: bx,
        bubbleY: by,
        bubbleWidth: bubbleW,
        bubbleHeight: bubbleH,
        asset: { image: asset.image as CanvasImageSource, drawWidth: drawW, drawHeight: drawH },
      })
      continue
    }

    const fallback = buildFallbackText(
      ctx,
      rawText,
      maxContentWidth,
      maxContentHeight,
      cfg.dialogue.font,
      vtDefaults,
      deps,
    )
    const bubbleW = Math.max(
      bubblePadding * 2,
      Math.min(slotWidth, fallback.textWidth + bubblePadding * 2),
    )
    const bubbleH = Math.max(
      MIN_BUBBLE_HEIGHT,
      Math.min(maxBubbleAreaHeight, fallback.textHeight + bubblePadding * 2),
    )
    const bx = clamp(slotRightEdge - bubbleW, panelBox.x, panelBox.x + panelBox.width - bubbleW)
    const maxBottom = panelBox.y + panelBox.height - AVAILABLE_VERTICAL_MARGIN
    let by = bubbleTop
    if (by + bubbleH > maxBottom) {
      by = Math.max(panelBox.y + PANEL_MARGIN_RATIO * panelBox.height, maxBottom - bubbleH)
    }
    instructions.push({
      dialogue,
      bubbleX: bx,
      bubbleY: by,
      bubbleWidth: bubbleW,
      bubbleHeight: bubbleH,
      fallback,
    })
  }

  return instructions
}

function layoutSingleDialogue(
  ctx: CanvasRenderingContext2D,
  dialogue: PanelDialogue,
  panelBox: Rect,
  bubbleTop: number,
  maxBubbleAreaHeight: number,
  bubblePadding: number,
  cfg: TextRenderConfig,
  vtDefaults: typeof appConfig.rendering.verticalText.defaults,
  deps?: PageRendererDeps,
): DialogueRenderInstruction[] {
  const rawText = dialogue.text ?? ''
  const key = buildDialogueKey({
    dialogue,
    fontSize: vtDefaults.fontSize,
    lineHeight: vtDefaults.lineHeight,
    letterSpacing: vtDefaults.letterSpacing,
    padding: vtDefaults.padding,
    maxCharsPerLine: vtDefaults.maxCharsPerLine,
  })
  const asset = getDialogueAsset(key)
  const maxAreaWidth = panelBox.width * SINGLE_BUBBLE_MAX_WIDTH_RATIO
  const perBubbleMaxHeight = Math.max(SINGLE_BUBBLE_MIN_HEIGHT, maxBubbleAreaHeight)
  const availableVertical = panelBox.y + panelBox.height - bubbleTop
  const maxThisBubbleHeight = Math.max(
    MIN_BUBBLE_HEIGHT,
    Math.min(perBubbleMaxHeight, availableVertical - AVAILABLE_VERTICAL_MARGIN),
  )

  if (asset) {
    let scale = Math.min(maxAreaWidth / asset.width, maxThisBubbleHeight / asset.height, 1)
    let drawW = Math.max(1, asset.width * scale)
    let drawH = Math.max(1, asset.height * scale)
    let bubbleW = (drawW + bubblePadding * 2) * Math.SQRT2
    let bubbleH = Math.max(MIN_BUBBLE_HEIGHT, (drawH + bubblePadding * 2) * Math.SQRT2)

    if (bubbleH > maxThisBubbleHeight) {
      const targetDrawH = maxThisBubbleHeight / Math.SQRT2 - bubblePadding * 2
      const newScale = targetDrawH > 0 ? targetDrawH / asset.height : 0
      scale = Math.min(scale, newScale)
      drawW = Math.max(1, asset.width * scale)
      drawH = Math.max(1, asset.height * scale)
      bubbleW = (drawW + bubblePadding * 2) * Math.SQRT2
      bubbleH = Math.max(MIN_BUBBLE_HEIGHT, (drawH + bubblePadding * 2) * Math.SQRT2)
    }

    bubbleW = clamp(bubbleW, bubblePadding * 2, panelBox.width * 0.95)
    bubbleH = clamp(bubbleH, MIN_BUBBLE_HEIGHT, maxThisBubbleHeight)
    const maxBottom = panelBox.y + panelBox.height - AVAILABLE_VERTICAL_MARGIN
    let by = bubbleTop
    if (by + bubbleH > maxBottom) {
      by = Math.max(panelBox.y + PANEL_MARGIN_RATIO * panelBox.height, maxBottom - bubbleH)
    }
    const bx = panelBox.x + panelBox.width - bubbleW - panelBox.width * PANEL_MARGIN_RATIO

    return [
      {
        dialogue,
        bubbleX: bx,
        bubbleY: by,
        bubbleWidth: bubbleW,
        bubbleHeight: bubbleH,
        asset: { image: asset.image as CanvasImageSource, drawWidth: drawW, drawHeight: drawH },
      },
    ]
  }

  const maxContentWidth = Math.max(10, maxAreaWidth / Math.SQRT2 - bubblePadding * 2)
  const maxContentHeight = Math.max(10, maxThisBubbleHeight / Math.SQRT2 - bubblePadding * 2)
  const fallback = buildFallbackText(
    ctx,
    rawText,
    maxContentWidth,
    maxContentHeight,
    cfg.dialogue.font,
    vtDefaults,
    deps,
  )
  const contentWidth = Math.min(maxContentWidth, fallback.textWidth)
  const contentHeight = Math.min(maxContentHeight, fallback.textHeight)
  let bubbleW = (contentWidth + bubblePadding * 2) * Math.SQRT2
  let bubbleH = (contentHeight + bubblePadding * 2) * Math.SQRT2
  bubbleW = clamp(bubbleW, bubblePadding * 2, panelBox.width * 0.95)
  bubbleH = clamp(bubbleH, MIN_BUBBLE_HEIGHT, maxThisBubbleHeight)
  const maxBottom = panelBox.y + panelBox.height - AVAILABLE_VERTICAL_MARGIN
  let by = bubbleTop
  if (by + bubbleH > maxBottom) {
    by = Math.max(panelBox.y + PANEL_MARGIN_RATIO * panelBox.height, maxBottom - bubbleH)
  }
  const bx = panelBox.x + panelBox.width - bubbleW - panelBox.width * PANEL_MARGIN_RATIO

  return [
    {
      dialogue,
      bubbleX: bx,
      bubbleY: by,
      bubbleWidth: bubbleW,
      bubbleHeight: bubbleH,
      fallback: {
        ...fallback,
        textWidth: contentWidth,
        textHeight: contentHeight,
      },
    },
  ]
}

function buildFallbackText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxContentWidth: number,
  maxContentHeight: number,
  baseFont: string,
  vtDefaults: typeof appConfig.rendering.verticalText.defaults,
  deps?: PageRendererDeps,
): FallbackRenderInfo {
  const sanitizedWidth = Math.max(10, maxContentWidth)
  const sanitizedHeight = Math.max(10, maxContentHeight)
  const normalized = (text ?? '').trim()
  if (!normalized) {
    const font = updateFontSize(baseFont, vtDefaults.fontSize)
    return { lines: [], font, lineHeight: Math.max(12, vtDefaults.fontSize * vtDefaults.lineHeight), textWidth: 0, textHeight: 0 }
  }

  const segments =
    deps?.segmentsPipeline?.getSegments(normalized) ?? wrapJapaneseByBudoux(normalized, 12)

  let fontSize = vtDefaults.fontSize
  let font = updateFontSize(baseFont, fontSize)
  const prevFont = ctx.font
  ctx.font = font
  let lineHeight = Math.max(12, fontSize * vtDefaults.lineHeight)
  let lines = wrapLinesByPhrase(ctx, segments, sanitizedWidth)
  if (lines.length === 0) {
    lines = simpleWrapLines(ctx, normalized, sanitizedWidth)
  }
  let textHeight = lines.length * lineHeight
  let textWidth = lines.reduce((acc, line) => Math.max(acc, measureTextWidthCached(ctx, line)), 0)
  let iterations = 0
  while (textHeight > sanitizedHeight && fontSize > 10 && iterations < 32) {
    fontSize -= 1
    font = updateFontSize(baseFont, fontSize)
    ctx.font = font
    lineHeight = Math.max(12, fontSize * vtDefaults.lineHeight)
    lines = wrapLinesByPhrase(ctx, segments, sanitizedWidth)
    if (lines.length === 0) {
      lines = simpleWrapLines(ctx, normalized, sanitizedWidth)
    }
    textHeight = lines.length * lineHeight
    textWidth = lines.reduce((acc, line) => Math.max(acc, measureTextWidthCached(ctx, line)), 0)
    iterations += 1
  }

  if (textHeight > sanitizedHeight && lines.length > 0) {
    const maxLines = Math.max(1, Math.floor(sanitizedHeight / lineHeight))
    lines = lines.slice(0, maxLines)
    textHeight = lines.length * lineHeight
    textWidth = lines.reduce((acc, line) => Math.max(acc, measureTextWidthCached(ctx, line)), 0)
  }

  textWidth = Math.min(sanitizedWidth, textWidth)
  ctx.font = prevFont
  return {
    lines,
    font,
    lineHeight,
    textWidth,
    textHeight,
  }
}

// simpleWrapLines: 互換用途で残す（他箇所から呼ばれる可能性があるため export せず維持）
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

function wrapLinesByPhrase(
  ctx: CanvasRenderingContext2D,
  phrases: string[] | readonly string[],
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ''
  for (const seg of phrases) {
    const tentative = current ? current + seg : seg
    if (tentative && ctx.measureText(tentative).width > maxWidth && current) {
      lines.push(current)
      current = seg
      continue
    }
    current = tentative
  }
  if (current) lines.push(current)
  return lines
}

function renderPanelSfx(
  ctx: CanvasRenderingContext2D,
  panel: MangaLayout['pages'][number]['panels'][number],
  box: PanelBox,
  cfg: TextRenderConfig,
  dialogueAreas: Rect[],
) {
  if (!panel.sfx || panel.sfx.length === 0) return

  const placer = new SfxPlacer()
  const placements = placer.placeSfx(
    panel.sfx,
    panel,
    { x: box.x, y: box.y, width: box.w, height: box.h },
    dialogueAreas,
  )

  const mainFill = cfg.sfx.fillStyle || '#000000'
  const supRatio = 0.35
  const supMin = 10

  for (const placement of placements) {
    ctx.save()
    if (placement.rotation) {
      ctx.translate(placement.x, placement.y)
      ctx.rotate(placement.rotation)
      ctx.translate(-placement.x, -placement.y)
    }

    const fontSize = Math.max(12, Math.round(placement.fontSize))
    const font = `bold ${fontSize}px "Noto Sans JP", sans-serif`
    ctx.font = font
    ctx.lineWidth = 4
    ctx.strokeStyle = '#ffffff'
    ctx.fillStyle = mainFill
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.strokeText(placement.text, placement.x, placement.y)
    ctx.fillText(placement.text, placement.x, placement.y)

    if (placement.supplement) {
      const supSize = Math.max(supMin, Math.round(fontSize * supRatio))
      ctx.font = `normal ${supSize}px "Noto Sans JP", sans-serif`
      const supY = placement.y + fontSize * 1.1
      ctx.strokeText(placement.supplement, placement.x, supY)
      ctx.fillText(placement.supplement, placement.x, supY)
    }

    ctx.restore()
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
