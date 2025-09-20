import type { Dialogue } from '@/types/panel-layout'
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
    config: { minFontSize: number; maxFontSize: number; padding: number; lineHeight: number },
  ): ContentTextPlacement | null {
    // 領域が有効でない場合は配置できない
    if (area.width <= 0 || area.height <= 0) {
      return null
    }

    const innerWidth = area.width - config.padding * 2
    const innerHeight = area.height - config.padding * 2
    if (innerWidth <= 0 || innerHeight <= 0) {
      return null
    }

    for (let fontSize = config.maxFontSize; fontSize >= config.minFontSize; fontSize -= 2) {
      ctx.font = `${fontSize}px sans-serif`
      const lines = this.wrapText(content, innerWidth, ctx)
      const totalHeight = lines.length * fontSize * config.lineHeight
      if (totalHeight <= innerHeight && lines.length > 0) {
        return {
          text: content,
          x: area.x + config.padding,
          y: area.y + config.padding,
          width: innerWidth,
          height: totalHeight,
          fontSize,
          lines,
          boundingBox: { ...area },
        }
      }
    }
    return null
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
    },
  ): ContentTextPlacement {
    const fontSize = config.minFontSize
    ctx.font = `${fontSize}px sans-serif`

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
    const lines = this.wrapText(content, innerWidth, ctx)
    const maxLines = Math.max(1, Math.floor(innerHeight / (fontSize * config.lineHeight)))
    if (lines.length > maxLines) {
      lines.splice(maxLines - 1)
      if (lines.length > 0) {
        const last = lines[lines.length - 1]
        lines[lines.length - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`
      }
    }
    return {
      text: content,
      x: area.x + config.padding,
      y: area.y + config.padding,
      width: innerWidth,
      height: Math.min(innerHeight, lines.length * fontSize * config.lineHeight),
      fontSize,
      lines,
      boundingBox: { ...area },
    }
  }

  /** テキストを指定幅で改行（日本語対応） */
  public wrapText(text: string, maxWidth: number, ctx: CanvasRenderingContext2D): string[] {
    const lines: string[] = []
    const paragraphs = text.split('\n')
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        lines.push('')
        continue
      }
      let currentLine = ''
      const chars = paragraph.split('')
      for (const char of chars) {
        const testLine = currentLine + char
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && currentLine !== '') {
          lines.push(currentLine)
          currentLine = char
        } else {
          currentLine = testLine
        }
      }
      if (currentLine) lines.push(currentLine)
    }
    return lines
  }
}
