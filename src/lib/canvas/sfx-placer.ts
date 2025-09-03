import type { Dialogue, Panel } from '@/types/panel-layout'

export interface SfxPlacement {
  text: string
  supplement?: string
  x: number
  y: number
  fontSize: number
  rotation?: number // ラジアン
}

export class SfxPlacer {
  /**
   * パネル内の他要素を避けてSFXを配置
   * @param sfxList SFXテキストのリスト
   * @param panel パネル情報
   * @param panelPixelBounds パネルのピクセル座標
   * @returns SFXの配置情報リスト
   */
  placeSfx(
    sfxList: string[],
    panel: Panel,
    panelPixelBounds: { x: number; y: number; width: number; height: number },
    preOccupiedAreas: Array<{ x: number; y: number; width: number; height: number }> = [],
  ): SfxPlacement[] {
    const placements: SfxPlacement[] = []

    // 占有領域を記録（他の要素との重なりを避けるため）
    const occupiedAreas: Array<{ x: number; y: number; width: number; height: number }> = [
      ...preOccupiedAreas,
    ]

    // 吹き出しの領域を占有領域として記録（概算）
    if (panel.dialogues) {
      for (const dialogue of panel.dialogues) {
        const bubbleArea = this.estimateBubbleArea(dialogue, panelPixelBounds)
        occupiedAreas.push(bubbleArea)
      }
    }

    // 各SFXを配置
    for (let i = 0; i < sfxList.length; i++) {
      const sfxText = sfxList[i]
      const { main, supplement } = this.parseSfxText(sfxText)

      const placement = this.findOptimalPosition(
        main,
        supplement,
        panelPixelBounds,
        occupiedAreas,
        i,
      )

      placements.push(placement)

      // このSFXの占有領域を記録（概算）
      occupiedAreas.push({
        x: placement.x,
        y: placement.y,
        width: Math.max(1, main.length * placement.fontSize * 0.8),
        height: placement.fontSize * 1.5,
      })
    }

    return placements
  }

  /**
   * SFXテキストをパース（sfx: プレフィックス除去・〈〉削除・補足切り出し）
   */
  private parseSfxText(rawSfx: string): { main: string; supplement?: string } {
    // NOTE: 入力は仕様上「〈SFX：…〉」の形が想定される。
    // 以前は「SFX: …」プレフィクス除去を先に行っていたため、
    // 先頭が角括弧（〈）で始まるケースではマッチしない不具合があった。
    // 対策として、まず括弧類を除去してからプレフィクス除去を実施する。

    // 〈〉/⟨⟩ を先に削除（全角・別字形対応）
    let cleanedText = rawSfx.replace(/[〈〉⟨⟩]/g, '')

    // 先頭の空白・不可視文字（BOM/ゼロ幅スペース等）を許容しつつ、
    // 半角/全角いずれの「SFX」「:」「：」にもマッチして除去する
    // - 例: "SFX: ...", " SFX：...", "ＳＦＸ：...", "\uFEFFSFX: ..."
    const PREFIX_RE = /^(?:\s|[\uFEFF\u200B-\u200D\u2060])*([sSｓＳ][fFｆＦ][xXｘＸ])\s*[:：]\s*/
    cleanedText = cleanedText.replace(PREFIX_RE, '').trim()

    // （）全角の補足
    const mFull = cleanedText.match(/^(.*?)（(.+?)）$/)
    if (mFull) {
      return { main: mFull[1].trim(), supplement: mFull[2].trim() }
    }
    // () 半角の補足
    const mHalf = cleanedText.match(/^(.*?)\((.+?)\)$/)
    if (mHalf) {
      return { main: mHalf[1].trim(), supplement: mHalf[2].trim() }
    }
    return { main: cleanedText.trim() }
  }

  /**
   * 吹き出しの占有領域を推定
   */
  private estimateBubbleArea(
    _dialogue: Dialogue,
    panelBounds: { x: number; y: number; width: number; height: number },
  ): { x: number; y: number; width: number; height: number } {
    const estimatedWidth = panelBounds.width * 0.45
    const estimatedHeight = panelBounds.height * 0.25
    const estimatedX = panelBounds.x + panelBounds.width * 0.5
    const estimatedY = panelBounds.y + panelBounds.height * 0.2
    return { x: estimatedX, y: estimatedY, width: estimatedWidth, height: estimatedHeight }
  }

  /**
   * 最適な配置位置を探す
   */
  private findOptimalPosition(
    mainText: string,
    supplement: string | undefined,
    panelBounds: { x: number; y: number; width: number; height: number },
    occupied: Array<{ x: number; y: number; width: number; height: number }>,
    index: number,
  ): SfxPlacement {
    const baseFontSize = Math.min(48, Math.max(24, panelBounds.height * 0.12))

    const candidates = [
      { x: panelBounds.x + panelBounds.width * 0.15, y: panelBounds.y + panelBounds.height * 0.2 },
      { x: panelBounds.x + panelBounds.width * 0.15, y: panelBounds.y + panelBounds.height * 0.7 },
      { x: panelBounds.x + panelBounds.width * 0.4, y: panelBounds.y + panelBounds.height * 0.15 },
      { x: panelBounds.x + panelBounds.width * 0.1, y: panelBounds.y + panelBounds.height * 0.45 },
      { x: panelBounds.x + panelBounds.width * 0.6, y: panelBounds.y + panelBounds.height * 0.75 },
    ]

    const startIdx = index % candidates.length
    const ordered = [...candidates.slice(startIdx), ...candidates.slice(0, startIdx)]

    for (const c of ordered) {
      let fontSize = baseFontSize
      const minFont = 18
      let attempts = 0
      while (attempts < 8 && fontSize >= minFont) {
        const width = Math.max(1, mainText.length * fontSize * 0.8)
        const height = fontSize * 1.5
        // パネル内に収めるため位置をクランプ
        const px = Math.min(Math.max(c.x, panelBounds.x), panelBounds.x + panelBounds.width - width)
        const py = Math.min(
          Math.max(c.y, panelBounds.y),
          panelBounds.y + panelBounds.height - height,
        )
        const test = { x: px, y: py, width, height }
        const overlap = occupied.some((a) => this.checkOverlap(test, a))
        const outOfPanel =
          test.x < panelBounds.x ||
          test.y < panelBounds.y ||
          test.x + test.width > panelBounds.x + panelBounds.width ||
          test.y + test.height > panelBounds.y + panelBounds.height
        if (!overlap && !outOfPanel) {
          return {
            text: mainText,
            supplement,
            x: px,
            y: py,
            fontSize,
            rotation: this.calculateRotation(index),
          }
        }
        fontSize = Math.max(minFont, Math.floor(fontSize * 0.9))
        attempts += 1
      }
    }

    // 全て重なる場合は小さめで最初の候補
    return {
      text: mainText,
      supplement,
      x: ordered[0].x,
      y: ordered[0].y,
      fontSize: baseFontSize * 0.7,
      rotation: this.calculateRotation(index),
    }
  }

  private checkOverlap(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    return !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    )
  }

  private calculateRotation(index: number): number {
    const rotations = [-0.15, 0.1, -0.08, 0.12, 0]
    return rotations[index % rotations.length]
  }
}
