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

  /** 左側の空き領域を計算 */
  private calculateLeftArea(panelBounds: {
    x: number
    y: number
    width: number
    height: number
  }): { x: number; y: number; width: number; height: number } | null {
    const padding = 10
    const leftBounds = {
      x: panelBounds.x + padding,
      y: panelBounds.y + padding,
      width: Math.max(0, panelBounds.width * 0.4 - padding),
      height: Math.max(0, panelBounds.height - padding * 2),
    }

    // パネル境界内に収まることを確認
    if (leftBounds.width <= 0 || leftBounds.height <= 0) {
      return null
    }

    const rect = this.getLargestEmptyRect(leftBounds, this.occupiedAreas, padding)
    return rect ?? null
  }

  /** 汎用: 指定領域内で占有矩形群を避けた最大の空き矩形を探索 */
  private getLargestEmptyRect(
    bounds: { x: number; y: number; width: number; height: number },
    obstacles: ReadonlyArray<{ x: number; y: number; width: number; height: number }>,
    margin: number,
  ): { x: number; y: number; width: number; height: number } | null {
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
    const bx0 = bounds.x
    const by0 = bounds.y
    const bx1 = bounds.x + bounds.width
    const by1 = bounds.y + bounds.height

    if (bounds.width <= 0 || bounds.height <= 0) return null

    // bounds と交差する障害物のみを対象にし、マージンを考慮して座標を拡張
    const relevant = obstacles
      .map((o) => ({ x0: o.x, y0: o.y, x1: o.x + o.width, y1: o.y + o.height }))
      .map((o) => ({ x0: o.x0 - margin, y0: o.y0 - margin, x1: o.x1 + margin, y1: o.y1 + margin }))
      .map((o) => ({
        x0: clamp(o.x0, bx0, bx1),
        y0: clamp(o.y0, by0, by1),
        x1: clamp(o.x1, bx0, bx1),
        y1: clamp(o.y1, by0, by1),
      }))
      .filter((o) => o.x0 < o.x1 && o.y0 < o.y1)
      .filter((o) => !(o.x1 <= bx0 || o.x0 >= bx1 || o.y1 <= by0 || o.y0 >= by1))

    // 候補座標（bounds の端と障害物の端）
    const xs = new Set<number>([bx0, bx1])
    const ys = new Set<number>([by0, by1])
    for (const o of relevant) {
      xs.add(o.x0)
      xs.add(o.x1)
      ys.add(o.y0)
      ys.add(o.y1)
    }
    const xList = Array.from(xs).sort((a, b) => a - b)
    const yList = Array.from(ys).sort((a, b) => a - b)

    let best: { x: number; y: number; width: number; height: number } | null = null
    let bestArea = 0

    // 全組み合わせから最大の空き矩形を探索
    for (let i = 0; i < xList.length; i++) {
      for (let j = i + 1; j < xList.length; j++) {
        const x0 = xList[i]
        const x1 = xList[j]
        if (x1 - x0 <= 0) continue
        for (let k = 0; k < yList.length; k++) {
          for (let l = k + 1; l < yList.length; l++) {
            const y0 = yList[k]
            const y1 = yList[l]
            if (y1 - y0 <= 0) continue
            const candidate = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
            const overlaps = relevant.some(
              (o) =>
                !(
                  candidate.x + candidate.width <= o.x0 ||
                  o.x1 <= candidate.x ||
                  candidate.y + candidate.height <= o.y0 ||
                  o.y1 <= candidate.y
                ),
            )
            if (!overlaps) {
              const area = candidate.width * candidate.height
              if (area > bestArea) {
                best = candidate
                bestArea = area
              }
            }
          }
        }
      }
    }

    return best
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

    if (maxX > minX && maxY > minY) {
      const area = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      // パネル境界内に収まることを確認
      if (area.width > 0 && area.height > 0) {
        return area
      }
    }
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

    if (maxX > minX && maxY > minY) {
      const area = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      // パネル境界内に収まることを確認
      if (area.width > 0 && area.height > 0) {
        return area
      }
    }
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
          const gap = { x: gx, y: gy, width: gw, height: gh }
          // パネル境界内に収まり、有効なサイズであることを確認
          if (gap.width >= minSize && gap.height >= minSize &&
              gap.x >= panelBounds.x && gap.y >= panelBounds.y &&
              gap.x + gap.width <= panelBounds.x + panelBounds.width &&
              gap.y + gap.height <= panelBounds.y + panelBounds.height) {
            gaps.push(gap)
          }
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
    // 領域が有効でない場合は配置できない
    if (area.width <= 0 || area.height <= 0) {
      return null
    }

    for (let fontSize = config.maxFontSize; fontSize >= config.minFontSize; fontSize -= 2) {
      ctx.font = `${fontSize}px sans-serif`
      const lines = this.wrapText(content, area.width - config.padding * 2, ctx)
      const totalHeight = lines.length * fontSize * config.lineHeight
      if (totalHeight <= area.height - config.padding * 2 && lines.length > 0) {
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

    // パネル境界内に収まる最大領域を計算
    const maxWidth = Math.min(
      panelBounds.width * (config.maxWidthRatio ?? 0.8),
      panelBounds.width - config.padding * 2
    )
    const maxHeight = Math.min(
      panelBounds.height * (config.maxHeightRatio ?? 0.3),
      panelBounds.height - config.padding * 2
    )

    const area = {
      x: panelBounds.x + config.padding,
      y: panelBounds.y + config.padding,
      width: Math.max(0, maxWidth),
      height: Math.max(0, maxHeight),
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
}
