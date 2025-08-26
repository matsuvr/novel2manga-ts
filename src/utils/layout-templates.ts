import type { LayoutTemplate } from '@/types/panel-layout'
import { selectRandomTemplateByCount } from '@/utils/panel-sample-loader'

// レイアウトルール（バリデーション用）
export const layoutRules = {
  forbidden: {
    // 均等なグリッド分割を検出
    isEqualGrid: (_panels: Array<{ position: { x: number; y: number } }>) => {
      // 簡易実装: より詳細な実装は後で追加
      return false
    },
    // 統一された寸法を検出
    hasUniformDimension: (_panels: Array<{ size: { width: number; height: number } }>) => {
      // 簡易実装: より詳細な実装は後で追加
      return false
    },
  },
  recommended: {
    // サイズの変化が豊富かチェック
    hasVariedSizes: (panels: Array<{ size: { width: number; height: number } }>) => {
      const sizes = panels.map((p) => p.size.width * p.size.height)
      const uniqueSizes = new Set(sizes.map((s) => Math.round(s * 100)))
      return uniqueSizes.size > 1
    },
  },
}

// ページタイプに応じたテンプレートを選択
export function selectLayoutTemplate(
  panelCount: number,
  _hasHighlight: boolean,
  _isClimax: boolean,
  _hasDialogue: boolean,
): LayoutTemplate {
  // サンプルパターンを優先的に使用
  const sample = selectRandomTemplateByCount(panelCount)
  if (sample) return sample

  // フォールバック: 基本的なレイアウトを生成
  return generateBasicLayout(panelCount)
}

// 基本的なレイアウトを生成（フォールバック用）
function generateBasicLayout(panelCount: number): LayoutTemplate {
  const panels = []

  switch (panelCount) {
    case 1:
      panels.push({
        position: { x: 0, y: 0 },
        size: { width: 1.0, height: 1.0 },
        priority: 1,
      })
      break
    case 2:
      panels.push(
        {
          position: { x: 0, y: 0 },
          size: { width: 1.0, height: 0.4 },
          priority: 1,
        },
        {
          position: { x: 0, y: 0.4 },
          size: { width: 1.0, height: 0.6 },
          priority: 2,
        },
      )
      break
    default: {
      // 3コマ以上は動的に生成
      const rows = Math.ceil(Math.sqrt(panelCount))
      const cols = Math.ceil(panelCount / rows)
      const cellWidth = 1.0 / cols
      const cellHeight = 1.0 / rows

      for (let i = 0; i < panelCount; i++) {
        const row = Math.floor(i / cols)
        const col = i % cols
        panels.push({
          position: { x: col * cellWidth, y: row * cellHeight },
          size: { width: cellWidth, height: cellHeight },
          priority: i + 1,
        })
      }
      break
    }
  }

  return {
    name: `basic-${panelCount}`,
    description: `Basic layout for ${panelCount} panels`,
    panelCount,
    panels,
  }
}

// Explicit selector that ignores scene attributes and uses random sample by count.
export function selectLayoutTemplateByCountRandom(panelCount: number): LayoutTemplate {
  const sample = selectRandomTemplateByCount(panelCount)
  if (sample) return sample
  // fallback to basic layout when samples missing
  return generateBasicLayout(panelCount)
}
