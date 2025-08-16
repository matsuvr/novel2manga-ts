import type { LayoutTemplate } from '@/types/panel-layout'
import { selectRandomTemplateByCount } from '@/utils/panel-sample-loader'

// 日本式マンガでよく使われるレイアウトテンプレート
// 重要: 均等なグリッド分割は読みにくいため避ける
export const layoutTemplates: LayoutTemplate[] = [
  {
    name: 'single-panel',
    description: '1ページ1コマ（見開きや重要シーン用）',
    panelCount: 1,
    panels: [
      {
        position: { x: 0, y: 0 },
        size: { width: 1.0, height: 1.0 },
        priority: 1,
      },
    ],
  },
  {
    name: 'two-asymmetric-vertical',
    description: '縦2分割（非対称）',
    panelCount: 2,
    panels: [
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
    ],
  },
  {
    name: 'three-dynamic',
    description: '3コマ動的レイアウト（サンプルから抽出）',
    panelCount: 3,
    panels: [
      {
        position: { x: 0.52, y: 0.05 },
        size: { width: 0.48, height: 0.25 },
        priority: 1,
      },
      {
        position: { x: 0.0, y: 0.05 },
        size: { width: 0.5, height: 0.48 },
        priority: 2,
      },
      {
        position: { x: 0.0, y: 0.53 },
        size: { width: 1.0, height: 0.47 },
        priority: 3,
      },
    ],
  },
  {
    name: 'four-narrative-flow',
    description: '4コマ物語展開用（サンプルから抽出）',
    panelCount: 4,
    panels: [
      {
        position: { x: 0.5, y: 0.05 },
        size: { width: 0.5, height: 0.55 },
        priority: 1,
      },
      {
        position: { x: 0.0, y: 0.05 },
        size: { width: 0.5, height: 0.2 },
        priority: 2,
      },
      {
        position: { x: 0.0, y: 0.25 },
        size: { width: 0.5, height: 0.35 },
        priority: 3,
      },
      {
        position: { x: 0.0, y: 0.6 },
        size: { width: 1.0, height: 0.4 },
        priority: 4,
      },
    ],
  },
  {
    name: 'five-emotion-focus',
    description: '5コマ感情表現用（サンプルから抽出）',
    panelCount: 5,
    panels: [
      {
        position: { x: 0.52, y: 0.05 },
        size: { width: 0.48, height: 0.25 },
        priority: 1,
      },
      {
        position: { x: 0.0, y: 0.05 },
        size: { width: 0.5, height: 0.48 },
        priority: 2,
      },
      {
        position: { x: 0.0, y: 0.3 },
        size: { width: 0.5, height: 0.23 },
        priority: 3,
      },
      {
        position: { x: 0.0, y: 0.53 },
        size: { width: 1.0, height: 0.2 },
        priority: 4,
      },
      {
        position: { x: 0.0, y: 0.73 },
        size: { width: 1.0, height: 0.27 },
        priority: 5,
      },
    ],
  },
  {
    name: 'six-conversation',
    description: '6コマ会話シーン用（サンプルから抽出）',
    panelCount: 6,
    panels: [
      {
        position: { x: 0.53, y: 0.05 },
        size: { width: 0.47, height: 0.23 },
        priority: 1,
      },
      {
        position: { x: 0.0, y: 0.05 },
        size: { width: 0.48, height: 0.45 },
        priority: 2,
      },
      {
        position: { x: 0.0, y: 0.5 },
        size: { width: 0.48, height: 0.18 },
        priority: 3,
      },
      {
        position: { x: 0.53, y: 0.28 },
        size: { width: 0.47, height: 0.27 },
        priority: 4,
      },
      {
        position: { x: 0.35, y: 0.55 },
        size: { width: 0.5, height: 0.18 },
        priority: 5,
      },
      {
        position: { x: 0.0, y: 0.73 },
        size: { width: 1.0, height: 0.27 },
        priority: 6,
      },
    ],
  },
  {
    name: 'four-climax',
    description: '4コマクライマックス用（感情の高まりを表現）',
    panelCount: 4,
    panels: [
      {
        position: { x: 0.0, y: 0.05 },
        size: { width: 1.0, height: 0.4 },
        priority: 1,
      },
      {
        position: { x: 0.58, y: 0.48 },
        size: { width: 0.42, height: 0.17 },
        priority: 2,
      },
      {
        position: { x: 0.0, y: 0.65 },
        size: { width: 0.6, height: 0.35 },
        priority: 3,
      },
      {
        position: { x: 0.6, y: 0.65 },
        size: { width: 0.4, height: 0.35 },
        priority: 4,
      },
    ],
  },
]

// レイアウト選択ルール
export const layoutRules = {
  // 絶対に避けるべきパターン
  forbidden: {
    // 均等分割は絶対NG
    isEqualGrid: (panels: Array<{ size: { width: number; height: number } }>) => {
      if (!panels || panels.length <= 1) return false
      const widths = panels.map((p) => p.size.width)
      const heights = panels.map((p) => p.size.height)
      const widthVariance = Math.max(...widths) - Math.min(...widths)
      const heightVariance = Math.max(...heights) - Math.min(...heights)
      return widthVariance < 0.1 && heightVariance < 0.1
    },
    // 縦または横が全て同じサイズもNG
    hasUniformDimension: (panels: Array<{ size: { width: number; height: number } }>) => {
      if (!panels || panels.length <= 1) return false
      const widths = new Set(panels.map((p) => Math.round(p.size.width * 100)))
      const heights = new Set(panels.map((p) => Math.round(p.size.height * 100)))
      return widths.size === 1 || heights.size === 1
    },
  },

  // 推奨されるパターン
  recommended: {
    // サイズの変化が豊富
    hasVariedSizes: (panels: Array<{ size: { width: number; height: number } }>) => {
      const areas = panels.map((p) => p.size.width * p.size.height)
      const maxArea = Math.max(...areas)
      const minArea = Math.min(...areas)
      return maxArea / minArea > 2.0 // 2倍以上の差があることが望ましい
    },
    // 視線の流れが明確
    hasGoodFlow: (panels: Array<{ position: { x: number; y: number } }>) => {
      // 右上から左下への流れをチェック
      const _sorted = [...panels].sort((a, b) => {
        if (Math.abs(a.position.y - b.position.y) < 0.1) {
          return b.position.x - a.position.x // 同じ高さなら右から左
        }
        return a.position.y - b.position.y // 上から下
      })
      return true // より詳細な実装は後で追加
    },
  },
}

// ページタイプに応じたテンプレートを選択
export function selectLayoutTemplate(
  panelCount: number,
  hasHighlight: boolean,
  isClimax: boolean,
  hasDialogue: boolean,
): LayoutTemplate {
  // New behavior: Prefer sample patterns by exact panel count, randomly.
  const sample = selectRandomTemplateByCount(panelCount)
  if (sample) return sample

  // クライマックスシーンは大きなコマを使う
  if (isClimax) {
    if (panelCount <= 2) {
      return layoutTemplates.find((t) => t.name === 'single-panel') || layoutTemplates[0]
    }
    return layoutTemplates.find((t) => t.name === 'four-climax') || layoutTemplates[6]
  }

  // 会話が多い場合
  if (hasDialogue && panelCount >= 5) {
    return layoutTemplates.find((t) => t.name === 'six-conversation') || layoutTemplates[5]
  }

  // ハイライトシーンがある場合
  if (hasHighlight) {
    return layoutTemplates.find((t) => t.name === 'five-emotion-focus') || layoutTemplates[4]
  }

  // パネル数に応じて適切なテンプレートを選択
  const candidates = layoutTemplates.filter((t) => Math.abs(t.panelCount - panelCount) <= 1)

  // 均等分割を避ける
  const validCandidates = candidates.filter(
    (template) =>
      !layoutRules.forbidden.isEqualGrid(template.panels) &&
      !layoutRules.forbidden.hasUniformDimension(template.panels),
  )

  if (validCandidates.length > 0) {
    // サイズの変化が豊富なものを優先
    return validCandidates.sort((a, b) => {
      const aVaried = layoutRules.recommended.hasVariedSizes(a.panels) ? 1 : 0
      const bVaried = layoutRules.recommended.hasVariedSizes(b.panels) ? 1 : 0
      return bVaried - aVaried
    })[0]
  }

  // フォールバック
  return layoutTemplates[3] // four-narrative-flow
}

// Explicit selector that ignores scene attributes and uses random sample by count.
export function selectLayoutTemplateByCountRandom(panelCount: number): LayoutTemplate {
  const sample = selectRandomTemplateByCount(panelCount)
  if (sample) return sample
  // fallback to nearest from built-ins when samples missing
  const candidates = layoutTemplates.filter((t) => Math.abs(t.panelCount - panelCount) <= 1)
  return candidates[0] || layoutTemplates[0]
}
