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

    const availableAreas = this.findAvailableAreas(panelBounds, config.minAreaSize ?? 80)

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
  ): Array<{ x: number; y: number; width: number; height: number }> {
    const areas: Array<{ x: number; y: number; width: number; height: number }> = []

    const leftArea = this.calculateLeftArea(panelBounds)
    if (leftArea && leftArea.width >= minAreaSize && leftArea.height >= minAreaSize)
      areas.push(leftArea)

    const topArea = this.calculateTopArea(panelBounds)
    if (topArea && topArea.width >= minAreaSize && topArea.height >= minAreaSize)
      areas.push(topArea)

    const bottomArea = this.calculateBottomArea(panelBounds)
    if (bottomArea && bottomArea.width >= minAreaSize && bottomArea.height >= minAreaSize)
      areas.push(bottomArea)

    const gapAreas = this.findGapAreas(panelBounds, minAreaSize)
    areas.push(...gapAreas)

    areas.sort((a, b) => b.width * b.height - a.width * a.height)
    return areas
  }

  /** 面積比で領域を制限 */
  private boundAreaToRatios(
    area: { x: number; y: number; width: number; height: number },
    panelBounds: { x: number; y: number; width: number; height: number },
    config: { maxWidthRatio?: number; maxHeightRatio?: number },
  ): { x: number; y: number; width: number; height: number } {
    const maxW = config.maxWidthRatio ? panelBounds.width * config.maxWidthRatio : area.width
    const maxH = config.maxHeightRatio ? panelBounds.height * config.maxHeightRatio : area.height
    return {
      x: area.x,
      y: area.y,
      width: Math.min(area.width, maxW),
      height: Math.min(area.height, maxH),
    }
  }

  /** 左側の空き領域を計算 */
  private calculateLeftArea(panelBounds: {
    x: number
    y: number
    width: number
    height: number
  }): { x: number; y: number; width: number; height: number } | null {
    const minX = panelBounds.x + 10
    let maxX = panelBounds.x + panelBounds.width * 0.4
    let minY = panelBounds.y + 10
    let maxY = panelBounds.y + panelBounds.height - 10

    for (const occupied of this.occupiedAreas) {
      if (occupied.type === 'dialogue') {
        maxX = Math.min(maxX, occupied.x - 10)
      } else if (occupied.type === 'sfx') {
        if (
          this.isOverlapping(
            { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
            occupied,
          )
        ) {
          if (occupied.y > panelBounds.y + panelBounds.height * 0.5) {
            maxY = Math.min(maxY, occupied.y - 10)
          } else {
            minY = Math.max(minY, occupied.y + occupied.height + 10)
          }
        }
      }
    }

    if (maxX > minX && maxY > minY)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    return null
  }

  /** 上部の空き領域を計算 */
  private calculateTopArea(panelBounds: {
    x: number
    y: number
    width: number
    height: number
  }): { x: number; y: number; width: number; height: number } | null {
    const minX = panelBounds.x + 10
    const maxX = panelBounds.x + panelBounds.width - 10
    const minY = panelBounds.y + 10
    let maxY = panelBounds.y + panelBounds.height * 0.3

    let topMostOccupied = panelBounds.y + panelBounds.height
    for (const occupied of this.occupiedAreas) {
      topMostOccupied = Math.min(topMostOccupied, occupied.y)
    }
    maxY = Math.min(maxY, topMostOccupied - 10)

    if (maxX > minX && maxY > minY)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    return null
  }

  /** 下部の空き領域を計算 */
  private calculateBottomArea(panelBounds: {
    x: number
    y: number
    width: number
    height: number
  }): { x: number; y: number; width: number; height: number } | null {
    const minX = panelBounds.x + 10
    const maxX = panelBounds.x + panelBounds.width - 10
    let minY = panelBounds.y + panelBounds.height * 0.7
    const maxY = panelBounds.y + panelBounds.height - 10

    let bottomMostOccupied = panelBounds.y
    for (const occupied of this.occupiedAreas) {
      bottomMostOccupied = Math.max(bottomMostOccupied, occupied.y + occupied.height)
    }
    minY = Math.max(minY, bottomMostOccupied + 10)

    if (maxX > minX && maxY > minY)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    return null
  }

  /** 占有領域間の隙間を探索 */
  private findGapAreas(
    panelBounds: { x: number; y: number; width: number; height: number },
    minSize: number,
  ): Array<{ x: number; y: number; width: number; height: number }> {
    const gaps: Array<{ x: number; y: number; width: number; height: number }> = []
    if (this.occupiedAreas.length >= 2) {
      const sorted = [...this.occupiedAreas].sort((a, b) => a.y - b.y)
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i]
        const b = sorted[i + 1]
        if (b.y > a.y + a.height + minSize) {
          const gx = Math.max(panelBounds.x + 10, Math.max(a.x, b.x))
          const gw =
            Math.min(
              panelBounds.x + panelBounds.width - 10,
              Math.min(a.x + a.width, b.x + b.width),
            ) - gx
          const gy = a.y + a.height + 10
          const gh = b.y - (a.y + a.height) - 20
          if (gw > minSize && gh > minSize) gaps.push({ x: gx, y: gy, width: gw, height: gh })
        }
      }
    }
    return gaps
  }

  /** テキストを領域に配置を試行 */
  private tryPlaceText(
    content: string,
    area: { x: number; y: number; width: number; height: number },
    ctx: CanvasRenderingContext2D,
    config: { minFontSize: number; maxFontSize: number; padding: number; lineHeight: number },
  ): ContentTextPlacement | null {
    for (let fontSize = config.maxFontSize; fontSize >= config.minFontSize; fontSize -= 2) {
      ctx.font = `${fontSize}px sans-serif`
      const lines = this.wrapText(content, area.width - config.padding * 2, ctx)
      const totalHeight = lines.length * fontSize * config.lineHeight
      if (totalHeight <= area.height - config.padding * 2) {
        return {
          text: content,
          x: area.x + config.padding,
          y: area.y + config.padding,
          width: area.width - config.padding * 2,
          height: totalHeight,
          fontSize,
          lines,
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

    const area = {
      x: panelBounds.x + 10,
      y: panelBounds.y + 10,
      width: Math.min(200, panelBounds.width * (config.maxWidthRatio ?? 0.4) || 200),
      height: Math.min(100, panelBounds.height * (config.maxHeightRatio ?? 0.3) || 100),
    }
    const lines = this.wrapText(content, area.width, ctx)
    const maxLines = Math.max(1, Math.floor(area.height / (fontSize * config.lineHeight)))
    if (lines.length > maxLines) {
      lines.splice(maxLines - 1)
      if (lines.length > 0) {
        const last = lines[lines.length - 1]
        lines[lines.length - 1] = `${last.slice(0, Math.max(0, last.length - 3))}...`
      }
    }
    return {
      text: content,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
      fontSize,
      lines,
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

  /** 領域の重なりチェック */
  private isOverlapping(
    area1: { x: number; y: number; width: number; height: number },
    area2: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(
      area1.x + area1.width < area2.x ||
      area2.x + area2.width < area1.x ||
      area1.y + area1.height < area2.y ||
      area2.y + area2.height < area1.y
    )
  }
}
