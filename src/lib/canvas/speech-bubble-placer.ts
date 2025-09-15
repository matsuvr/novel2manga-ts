import type { Dialogue } from '@/types/panel-layout'
import type { PanelLayout } from './panel-layout-engine'

const RIGHT_X_RATIO = 0.7
const LEFT_X_RATIO = 0.3
const TOP_OFFSET_RATIO = 0.2
const VERTICAL_SPREAD_RATIO = 0.6
const CIRCULAR_RADIUS_RATIO = 0.3

export interface BubblePlacement {
  dialogue: Dialogue
  position: { x: number; y: number }
  style: 'normal' | 'thought' | 'shout'
  tailDirection: 'left' | 'right' | 'up' | 'down'
}

export class SpeechBubblePlacer {
  /**
   * パネル内の対話を吹き出しとして配置
   */
  placeDialogues(dialogues: Dialogue[], panelLayout: PanelLayout): Dialogue[] {
    if (!dialogues || dialogues.length === 0) {
      return []
    }

    // 対話の配置戦略を決定
    const placementStrategy = this.determinePlacementStrategy(dialogues.length)

    // 各対話に配置情報を追加
    const placedDialogues: Dialogue[] = []

    for (let i = 0; i < dialogues.length; i++) {
      const dialogue = dialogues[i]
      const _placement = this.calculateBubblePlacement(
        dialogue,
        i,
        dialogues.length,
        panelLayout,
        placementStrategy,
      )

      // 配置情報を対話に追加（実際の描画時に使用）
      const placedDialogue: Dialogue = {
        ...dialogue,
        // 吹き出しの位置情報は描画時に計算されるため、ここでは対話の順序と重要度を保持
        emotion: dialogue.emotion,
      }

      placedDialogues.push(placedDialogue)
    }

    return placedDialogues
  }

  /**
   * 配置戦略を決定
   */
  private determinePlacementStrategy(dialogueCount: number): 'vertical' | 'zigzag' | 'circular' {
    if (dialogueCount <= 2) {
      return 'vertical'
    } else if (dialogueCount <= 4) {
      return 'zigzag'
    } else {
      return 'circular'
    }
  }

  /**
   * 吹き出しの配置を計算
   */
  private calculateBubblePlacement(
    dialogue: Dialogue,
    index: number,
    total: number,
    panelLayout: PanelLayout,
    strategy: 'vertical' | 'zigzag' | 'circular',
  ): BubblePlacement {
    const panelX = panelLayout.position.x
    const panelY = panelLayout.position.y
    const panelWidth = panelLayout.size.width
    const panelHeight = panelLayout.size.height

    let x: number
    let y: number
    let tailDirection: 'left' | 'right' | 'up' | 'down' = 'left'

    switch (strategy) {
      case 'vertical':
        // 縦に並べる（日本式：右から左へ）
        if (total === 2 && index === 1) {
          x = panelX + panelWidth * LEFT_X_RATIO
          tailDirection = 'left'
        } else {
          x = panelX + panelWidth * RIGHT_X_RATIO
          tailDirection = 'right'
        }
        y =
          panelY +
          panelHeight *
            (TOP_OFFSET_RATIO + (index * VERTICAL_SPREAD_RATIO) / Math.max(total - 1, 1))
        break

      case 'zigzag': {
        // ジグザグ配置
        const isRight = index % 2 === 0
        x = panelX + panelWidth * (isRight ? RIGHT_X_RATIO : LEFT_X_RATIO)
        y =
          panelY +
          panelHeight *
            (TOP_OFFSET_RATIO + (index * VERTICAL_SPREAD_RATIO) / Math.max(total - 1, 1))
        tailDirection = isRight ? 'right' : 'left'
        break
      }

      case 'circular': {
        // 円形配置
        const angle = (index / total) * Math.PI * 2 - Math.PI / 2
        const radiusX = panelWidth * CIRCULAR_RADIUS_RATIO
        const radiusY = panelHeight * CIRCULAR_RADIUS_RATIO
        x = panelX + panelWidth * 0.5 + Math.cos(angle) * radiusX
        y = panelY + panelHeight * 0.5 + Math.sin(angle) * radiusY

        // 尾の方向を中心に向ける
        if (Math.abs(Math.cos(angle)) > Math.abs(Math.sin(angle))) {
          tailDirection = Math.cos(angle) > 0 ? 'left' : 'right'
        } else {
          tailDirection = Math.sin(angle) > 0 ? 'up' : 'down'
        }
        break
      }
    }

    return {
      dialogue,
      position: { x, y },
      style: this.determineStyle(dialogue),
      tailDirection,
    }
  }

  /**
   * 対話のスタイルを決定
   */
  private determineStyle(dialogue: Dialogue): 'normal' | 'thought' | 'shout' {
    // スタイルはテキスト記号からのみ推定（emotion文字列は自由記述として解釈しない）
    const text = dialogue.text
    if (text.includes('！') || text.includes('!')) return 'shout'
    if (text.startsWith('（') || text.startsWith('(')) return 'thought'
    return 'normal'
  }

  /**
   * 吹き出しの重なりをチェック
   */
  checkOverlap(placements: BubblePlacement[]): boolean {
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const p1 = placements[i].position
        const p2 = placements[j].position

        // 簡易的な重なりチェック（吹き出しのサイズを考慮）
        const minDistance = 0.1 // 最小距離（正規化座標）
        const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2)

        if (distance < minDistance) {
          return true
        }
      }
    }

    return false
  }

  /**
   * 配置を最適化（重なりを解消）
   */
  optimizePlacements(placements: BubblePlacement[]): BubblePlacement[] {
    const optimized = [...placements]

    // 重なりがある場合は位置を調整
    let attempts = 0
    while (this.checkOverlap(optimized) && attempts < 10) {
      for (let i = 1; i < optimized.length; i++) {
        const prev = optimized[i - 1]
        const curr = optimized[i]

        // 前の吹き出しと重なっている場合は位置を調整
        const dx = curr.position.x - prev.position.x
        const dy = curr.position.y - prev.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < 0.1) {
          // 少しずらす
          curr.position.y += 0.05
          if (curr.position.x > 0.5) {
            curr.position.x -= 0.05
          } else {
            curr.position.x += 0.05
          }
        }
      }

      attempts++
    }

    return optimized
  }
}
