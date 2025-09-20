import { createLogger, LogLevel } from '@/logging/enhanced-logger'
import type { Dialogue } from '@/types/panel-layout'
import { wrapJapaneseByBudoux } from '@/utils/jp-linebreak'
import type { SfxPlacement } from './sfx-placer'

export interface ElementBounds {
  x: number
  y: number
  width: number
  height: number
  type: 'dialogue' | 'sfx' | 'content'
}

export interface ContentTextPlacement {
  text: string
  x: number
  y: number
  width: number
  height: number
  fontSize: number
  lines: string[]
  boundingBox: { x: number; y: number; width: number; height: number }
}

const FULLWIDTH_SAMPLE_CHAR = '漢'
const ASCII_SAMPLE_CHAR = 'M'
// Allow 6% slack so BudouX-wrapped lines remain inside the measured width.
const WIDTH_SAFETY_RATIO = 0.94
// Permit a 2% tolerance to absorb floating point differences in measureText.
const WIDTH_TOLERANCE = 1.02
// Evaluate every integer font size between max and min for readability.
const FONT_SIZE_STEP = 1
// Fine-grained fallback step when we need to keep shrinking text.
const FONT_SIZE_FINE_STEP = 0.5
// Absolute guard so we never emit zero or negative font sizes.
const MIN_FONT_SIZE_ABSOLUTE = 1
// Cap iterative scaling to avoid runaway loops when bounds are extremely small.
const MAX_FONT_ADJUSTMENT_ITERATIONS = 40

/**
 * パネル内の全要素（吹き出し、SFX、説明文）の配置を調整
 */
export class PanelLayoutCoordinator {
  private occupiedAreas: ElementBounds[] = []

  /** パネル内の要素配置をリセット */
  reset(): void {
    this.occupiedAreas = []
  }

  /** 吹き出しの占有領域を登録 */
  registerDialogueArea(
    _dialogue: Dialogue,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    this.occupiedAreas.push({ ...bounds, type: 'dialogue' })
  }

  /** SFXの占有領域を登録 */
  registerSfxArea(
    placement: SfxPlacement,
    estimatedBounds: { width: number; height: number },
  ): void {
    this.occupiedAreas.push({
      x: placement.x,
      y: placement.y,
      width: estimatedBounds.width,
      height: estimatedBounds.height,
      type: 'sfx',
    })
  }

  /** 説明テキストの占有領域を登録 */
  registerContentArea(bounds: { x: number; y: number; width: number; height: number }): void {
    this.occupiedAreas.push({ ...bounds, type: 'content' })
  }

  /** 現在登録されている占有領域を取得（テストや配置計算用） */
  getOccupiedAreas(): ReadonlyArray<ElementBounds> {
    return this.occupiedAreas
  }

  /** 説明テキストの最適な配置を計算 */
  calculateContentTextPlacement(
    content: string,
    panelBounds: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: {
      minFontSize: number
      maxFontSize: number
      padding: number
      lineHeight: number
      maxWidthRatio?: number
      maxHeightRatio?: number
      minAreaSize?: number
      fontFamily?: string
    },
  ): ContentTextPlacement | null {
    if (!content || content.trim() === '') return null

    const availableAreas = this.findAvailableAreas(
      panelBounds,
      config.minAreaSize ?? 80,
      config.padding,
    )

    for (const area of availableAreas) {
      const bounded = this.boundAreaToRatios(area, panelBounds, config)
      const placement = this.tryPlaceText(content, bounded, ctx, config)
      if (placement) return placement
    }

    return this.forcePlace(content, panelBounds, ctx, config)
  }

  /** 利用可能な領域を探索 */
  private findAvailableAreas(
    panelBounds: { x: number; y: number; width: number; height: number },
    minAreaSize: number,
    margin: number,
  ): Array<{ x: number; y: number; width: number; height: number }> {
    if (panelBounds.width <= 0 || panelBounds.height <= 0) {
      return []
    }

    // NOTE: This implementation builds a grid from obstacle edges (xs, ys)
    // and then checks all axis-aligned candidate rectangles. The runtime
    // grows quickly with the number of obstacles because each obstacle
    // contributes coordinates to the grid; the nested loops over x and y
    // coordinates make the candidate generation roughly O(M^2 * N^2)
    // in the worst case where M and N are the number of unique x and y
    // coordinates respectively. Since M and N are both O(O) where O is
    // the number of obstacles, the overall worst-case behavior approaches
    // O(O^4) for candidate enumeration plus the obstacle overlap checks
    // inside which can add an additional factor. In practice obstacles
    // per panel are small, but if they grow this function can become a
    // performance hotspot.
    //
    // To help detect regressions, warn when the number of occupied areas
    // (after margin expansion) exceeds a defensive threshold.
    const logger = createLogger(LogLevel.WARN)
    const OBSTACLE_WARN_THRESHOLD = 20

    const safeMargin = Math.max(0, margin)
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
    const panelLeft = panelBounds.x
    const panelTop = panelBounds.y
    const panelRight = panelBounds.x + panelBounds.width
    const panelBottom = panelBounds.y + panelBounds.height

    const expandedObstacles = this.occupiedAreas
      .map((area) => ({
        x0: clamp(area.x - safeMargin, panelLeft, panelRight),
        y0: clamp(area.y - safeMargin, panelTop, panelBottom),
        x1: clamp(area.x + area.width + safeMargin, panelLeft, panelRight),
        y1: clamp(area.y + area.height + safeMargin, panelTop, panelBottom),
      }))
      .filter((area) => area.x0 < area.x1 && area.y0 < area.y1)

    if (expandedObstacles.length > OBSTACLE_WARN_THRESHOLD) {
      logger.warn(
        'PanelLayoutCoordinator',
        `findAvailableAreas: large number of obstacles (${expandedObstacles.length}) may impact performance`,
        { threshold: OBSTACLE_WARN_THRESHOLD },
      )
    }

    const xs = new Set<number>([panelLeft, panelRight])
    const ys = new Set<number>([panelTop, panelBottom])

    if (safeMargin > 0) {
      xs.add(clamp(panelLeft + safeMargin, panelLeft, panelRight))
      xs.add(clamp(panelRight - safeMargin, panelLeft, panelRight))
      ys.add(clamp(panelTop + safeMargin, panelTop, panelBottom))
      ys.add(clamp(panelBottom - safeMargin, panelTop, panelBottom))
    }

    for (const obstacle of expandedObstacles) {
      xs.add(obstacle.x0)
      xs.add(obstacle.x1)
      ys.add(obstacle.y0)
      ys.add(obstacle.y1)
    }

    const xCoords = Array.from(xs).sort((a, b) => a - b)
    const yCoords = Array.from(ys).sort((a, b) => a - b)

    const candidates: Array<{ x: number; y: number; width: number; height: number }> = []
    const seen = new Set<string>()

    for (let i = 0; i < xCoords.length; i++) {
      for (let j = i + 1; j < xCoords.length; j++) {
        const x0 = xCoords[i]
        const x1 = xCoords[j]
        const width = x1 - x0
        if (width <= 0) continue

        for (let k = 0; k < yCoords.length; k++) {
          for (let l = k + 1; l < yCoords.length; l++) {
            const y0 = yCoords[k]
            const y1 = yCoords[l]
            const height = y1 - y0
            if (height <= 0) continue

            if (width < minAreaSize || height < minAreaSize) continue

            const overlaps = expandedObstacles.some(
              (obs) => !(x1 <= obs.x0 || x0 >= obs.x1 || y1 <= obs.y0 || y0 >= obs.y1),
            )

            if (overlaps) continue

            const key = `${x0}:${y0}:${width}:${height}`
            if (seen.has(key)) continue
            seen.add(key)
            candidates.push({ x: x0, y: y0, width, height })
          }
        }
      }
    }

    if (candidates.length === 0 && expandedObstacles.length === 0) {
      const insetX = clamp(panelLeft + safeMargin, panelLeft, panelRight)
      const insetY = clamp(panelTop + safeMargin, panelTop, panelBottom)
      const insetWidth = Math.max(0, panelRight - insetX - safeMargin)
      const insetHeight = Math.max(0, panelBottom - insetY - safeMargin)
      if (insetWidth > 0 && insetHeight > 0) {
        return [{ x: insetX, y: insetY, width: insetWidth, height: insetHeight }]
      }
    }

    candidates.sort((a, b) => b.width * b.height - a.width * a.height)
    return candidates
  }

  /** 面積比で領域を制限 */
  private boundAreaToRatios(
    area: { x: number; y: number; width: number; height: number },
    panelBounds: { x: number; y: number; width: number; height: number },
    config: { maxWidthRatio?: number; maxHeightRatio?: number },
  ): { x: number; y: number; width: number; height: number } {
    const maxW = config.maxWidthRatio ? panelBounds.width * config.maxWidthRatio : area.width
    const maxH = config.maxHeightRatio ? panelBounds.height * config.maxHeightRatio : area.height

    // パネル境界内に収める
    const boundedArea = {
      x: Math.max(panelBounds.x, area.x),
      y: Math.max(panelBounds.y, area.y),
      width: Math.min(panelBounds.x + panelBounds.width - area.x, Math.min(area.width, maxW)),
      height: Math.min(panelBounds.y + panelBounds.height - area.y, Math.min(area.height, maxH)),
    }

    // 負の値にならないようにする
    boundedArea.width = Math.max(0, boundedArea.width)
    boundedArea.height = Math.max(0, boundedArea.height)

    return boundedArea
  }

  /** テキストを領域に配置を試行 */
  private tryPlaceText(
    content: string,
    area: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: {
      minFontSize: number
      maxFontSize: number
      padding: number
      lineHeight: number
      fontFamily?: string
    },
  ): ContentTextPlacement | null {
    if (area.width <= 0 || area.height <= 0) {
      return null
    }

    const innerWidth = area.width - config.padding * 2
    const innerHeight = area.height - config.padding * 2
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null
    }

    const fontFamily = config.fontFamily ?? 'sans-serif'
    // normalize font size bounds so the loop runs at least once and respects absolute min
    const minFont = Math.max(MIN_FONT_SIZE_ABSOLUTE, config.minFontSize)
    const maxFont = Math.max(minFont, config.maxFontSize)
    let bestOverflow: { fontSize: number; totalHeight: number } | null = null

    for (let fontSize = maxFont; fontSize >= minFont; fontSize -= FONT_SIZE_STEP) {
      const normalizedFont = Math.max(MIN_FONT_SIZE_ABSOLUTE, fontSize)
      ctx.font = `${normalizedFont}px ${fontFamily}`
      const maxChars = this.estimateMaxCharsForWidth(innerWidth, ctx, normalizedFont)
      const wrapped = this.wrapTextWithBudoux(content, ctx, innerWidth, maxChars)
      if (wrapped.lines.length === 0) {
        continue
      }

      const lineHeightPx = Math.ceil(normalizedFont * config.lineHeight)
      const totalHeight = wrapped.lines.length * lineHeightPx

      if (totalHeight <= innerHeight) {
        return {
          text: content,
          x: area.x + config.padding,
          y: area.y + config.padding,
          width: innerWidth,
          height: totalHeight,
          fontSize: normalizedFont,
          lines: wrapped.lines,
          boundingBox: { ...area },
        }
      }

      if (bestOverflow === null || totalHeight < bestOverflow.totalHeight) {
        bestOverflow = { fontSize: normalizedFont, totalHeight }
      }
    }

    // At this point, bestOverflow should always be set because the for-loop runs
    // from maxFont down to minFont and wrapTextWithBudoux returns at least one
    // line for non-empty content. Keep a defensive fallback just in case.
    if (bestOverflow === null) {
      const fallbackFont = minFont
      ctx.font = `${fallbackFont}px ${fontFamily}`
      const maxChars = this.estimateMaxCharsForWidth(innerWidth, ctx, fallbackFont)
      const wrapped = this.wrapTextWithBudoux(content, ctx, innerWidth, maxChars)
      const fallbackHeight = wrapped.lines.length * Math.ceil(fallbackFont * config.lineHeight)
      bestOverflow = { fontSize: fallbackFont, totalHeight: fallbackHeight }
    }

    return this.scalePlacementToFit(
      content,
      area,
      ctx,
      {
        padding: config.padding,
        lineHeight: config.lineHeight,
        fontFamily,
      },
      {
        innerWidth,
        innerHeight,
        initialFontSize: bestOverflow.fontSize,
        initialTotalHeight: bestOverflow.totalHeight,
      },
    )
  }

  /** 強制配置（最後の手段） */
  private forcePlace(
    content: string,
    panelBounds: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: {
      minFontSize: number
      maxFontSize: number
      padding: number
      lineHeight: number
      maxWidthRatio?: number
      maxHeightRatio?: number
      fontFamily?: string
    },
  ): ContentTextPlacement {
    const fontFamily = config.fontFamily ?? 'sans-serif'
    const baseFontSize = Math.max(MIN_FONT_SIZE_ABSOLUTE, config.minFontSize)
    ctx.font = `${baseFontSize}px ${fontFamily}`

    const availableWidth = Math.max(0, panelBounds.width - config.padding * 2)
    const availableHeight = Math.max(0, panelBounds.height - config.padding * 2)

    const boundedWidth = Math.min(
      availableWidth,
      panelBounds.width * (config.maxWidthRatio ?? 0.8),
    )
    const boundedHeight = Math.min(
      availableHeight,
      panelBounds.height * (config.maxHeightRatio ?? 0.3),
    )

    const area = {
      x: panelBounds.x + config.padding,
      y: panelBounds.y + config.padding,
      width: Math.max(0, boundedWidth),
      height: Math.max(0, boundedHeight),
    }

    const innerWidth = Math.max(0, area.width - config.padding * 2)
    const innerHeight = Math.max(0, area.height - config.padding * 2)

    if (innerWidth <= 0 || innerHeight <= 0) {
      return this.createEmptyPlacement(content, area, config.padding, innerWidth, baseFontSize)
    }

    const maxChars = this.estimateMaxCharsForWidth(innerWidth, ctx, baseFontSize)
    const wrapped = this.wrapTextWithBudoux(content, ctx, innerWidth, maxChars)
    const lineHeightPx = Math.ceil(baseFontSize * config.lineHeight)
    const totalHeight = wrapped.lines.length * lineHeightPx

    if (totalHeight <= innerHeight) {
      return {
        text: content,
        x: area.x + config.padding,
        y: area.y + config.padding,
        width: innerWidth,
        height: totalHeight,
        fontSize: baseFontSize,
        lines: wrapped.lines,
        boundingBox: { ...area },
      }
    }

    return this.scalePlacementToFit(
      content,
      area,
      ctx,
      {
        padding: config.padding,
        lineHeight: config.lineHeight,
        fontFamily,
      },
      {
        innerWidth,
        innerHeight,
        initialFontSize: baseFontSize,
        initialTotalHeight: totalHeight,
      },
    )
  }

  private estimateMaxCharsForWidth(
    availableWidth: number,
    ctx: CanvasRenderingContext2D,
    fontSize: number,
  ): number {
    if (availableWidth <= 0) {
      return 1
    }

    const fullWidth = ctx.measureText(FULLWIDTH_SAMPLE_CHAR).width
    const asciiWidth = ctx.measureText(ASCII_SAMPLE_CHAR).width

    const baselineWidth = Number.isFinite(fullWidth) && fullWidth > 0
      ? fullWidth
      : Number.isFinite(asciiWidth) && asciiWidth > 0
        ? asciiWidth
        : fontSize

    const safeWidth = Math.max(1, baselineWidth * WIDTH_SAFETY_RATIO)
    return Math.max(1, Math.floor(availableWidth / safeWidth))
  }

  private wrapTextWithBudoux(
    text: string,
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
    maxChars: number,
  ): { lines: string[]; limitUsed: number } {
    const normalizedLimit = Math.max(1, Math.floor(maxChars))
    const paragraphs = text.split(/\r?\n/)
    const segments = paragraphs.length > 0 ? paragraphs : [text]

    for (let limit = normalizedLimit; limit >= 1; limit -= 1) {
      const candidate: string[] = []
      for (const segment of segments) {
        if (segment.trim() === '') {
          candidate.push('')
          continue
        }
        const wrapped = wrapJapaneseByBudoux(segment, limit)
        if (wrapped.length === 0) {
          candidate.push('')
        } else {
          candidate.push(...wrapped)
        }
      }

      const overflow = candidate.some(
        (line) => ctx.measureText(line).width > maxWidth * WIDTH_TOLERANCE,
      )
      if (!overflow) {
        return { lines: candidate, limitUsed: limit }
      }
    }

    const fallbackLines: string[] = []
    for (const segment of segments) {
      if (segment.trim() === '') {
        fallbackLines.push('')
      } else {
        fallbackLines.push(...wrapJapaneseByBudoux(segment, 1))
      }
    }
    return { lines: fallbackLines, limitUsed: 1 }
  }

  /** 内部幅が非正の場合の空の配置を生成するユーティリティ */
  private createEmptyPlacement(
    content: string,
    area: { x: number; y: number; width: number; height: number },
    padding: number,
    innerWidth: number,
    fontSize: number,
  ): ContentTextPlacement {
    return {
      text: content,
      x: area.x + padding,
      y: area.y + padding,
      width: Math.max(0, innerWidth),
      height: 0,
      fontSize: Math.max(MIN_FONT_SIZE_ABSOLUTE, fontSize),
      lines: [],
      boundingBox: { ...area },
    }
  }

  private scalePlacementToFit(
    content: string,
    area: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: { padding: number; lineHeight: number; fontFamily: string },
    dimensions: {
      innerWidth: number
      innerHeight: number
      initialFontSize: number
      initialTotalHeight: number
    },
  ): ContentTextPlacement {
    const { innerWidth, innerHeight, initialFontSize, initialTotalHeight } = dimensions
    const fontFamily = config.fontFamily

    if (innerWidth <= 0 || innerHeight <= 0) {
      return this.createEmptyPlacement(content, area, config.padding, innerWidth, initialFontSize)
    }

    let fontSize = Math.max(
      MIN_FONT_SIZE_ABSOLUTE,
      initialTotalHeight > 0
        ? Math.min(initialFontSize, (innerHeight / initialTotalHeight) * initialFontSize)
        : initialFontSize,
    )

    let lines: string[] = []
    let totalHeight = Number.POSITIVE_INFINITY

    for (let i = 0; i < MAX_FONT_ADJUSTMENT_ITERATIONS; i++) {
      const normalizedFont = Math.max(MIN_FONT_SIZE_ABSOLUTE, fontSize)
      ctx.font = `${normalizedFont}px ${fontFamily}`
      const maxChars = this.estimateMaxCharsForWidth(innerWidth, ctx, normalizedFont)
      const wrapped = this.wrapTextWithBudoux(content, ctx, innerWidth, maxChars)
      lines = wrapped.lines

      const lineHeightPx = Math.ceil(normalizedFont * config.lineHeight)
      totalHeight = lines.length * lineHeightPx
      if (totalHeight <= innerHeight) {
        fontSize = normalizedFont
        break
      }

      const scaledFont = totalHeight > 0 ? normalizedFont * (innerHeight / totalHeight) : normalizedFont
      const nextFont =
        Math.abs(scaledFont - normalizedFont) < FONT_SIZE_FINE_STEP
          ? normalizedFont - FONT_SIZE_FINE_STEP
          : scaledFont

      const adjustedFont = Math.max(MIN_FONT_SIZE_ABSOLUTE, nextFont)
      if (adjustedFont === normalizedFont) {
        break
      }
      fontSize = adjustedFont
    }

    const finalFont = Math.max(MIN_FONT_SIZE_ABSOLUTE, fontSize)
    ctx.font = `${finalFont}px ${fontFamily}`
    const maxChars = this.estimateMaxCharsForWidth(innerWidth, ctx, finalFont)
    const wrapped = this.wrapTextWithBudoux(content, ctx, innerWidth, maxChars)
    lines = wrapped.lines
    const lineHeightPx = Math.ceil(finalFont * config.lineHeight)
    const finalHeight = Math.min(innerHeight, lines.length * lineHeightPx)

    return {
      text: content,
      x: area.x + config.padding,
      y: area.y + config.padding,
      width: innerWidth,
      height: finalHeight,
      fontSize: finalFont,
      lines,
      boundingBox: { ...area },
    }
  }
}
