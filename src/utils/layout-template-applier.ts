import type { LayoutTemplate, MangaLayout, Page, Panel } from '@/types/panel-layout'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'

/**
 * Apply a random layout template (drawn from bundled samples) to each page based on its panel count.
 * The panel order in the input layout is preserved, but their positions/sizes are replaced by the
 * corresponding template slots. If no sample template is available, the fallback generator from
 * selectLayoutTemplateByCountRandom provides a deterministic grid layout.
 */
export function applyTemplatesByPanelCount(layout: MangaLayout): MangaLayout {
  const pages: Page[] = layout.pages.map((page) => {
    const panelCount = page.panels?.length ?? 0
    if (!panelCount) return page

    const template = selectLayoutTemplateByCountRandom(panelCount)
    const templatePanels = template.panels
    if (templatePanels.length === 0) return page

    const remappedPanels = page.panels.map((panel, index) => remapPanel(panel, templatePanels, index))

    // ページ全体の垂直占有率をチェックし、十分でなければ一括正規化
    const verticallyNormalized = normalizePanelsVerticalCoverage(remappedPanels)
    return { ...page, panels: verticallyNormalized }
  })

  return { ...layout, pages }
}

/**
 * ページ内パネル群の垂直方向占有率を 0..1 に拡張する共通処理。
 * - 現在の最小 y (minY) と最大 (y+height) (maxY) を測定
 * - span = maxY - minY が 1 に極めて近い (>=0.999) 場合はそのまま
 * - それ未満なら (y-minY)/span を新 y、height/span を新 height に変換
 * - 負値や 1 超過が出ないよう 0〜1 に clamp（丸めは 1e-6 単位）
 * - 面積比率を保ちながら余白を吸収
 */
export function normalizePanelsVerticalCoverage(panels: Panel[]): Panel[] {
  if (panels.length === 0) return panels
  const ys = panels.map((p) => ({ y: p.position.y, h: p.size.height }))
  const minY = Math.min(...ys.map((v) => v.y))
  const maxY = Math.max(...ys.map((v) => v.y + v.h))
  const span = maxY - minY
  if (!(span > 0) || span >= 0.999) return panels

  const scale = 1 / span
  return panels.map((p) => {
    const newYRaw = (p.position.y - minY) * scale
    const newHRaw = p.size.height * scale
    const newY = clamp01(round6(newYRaw))
    const newH = clamp01(round6(newHRaw))
    return {
      ...p,
      position: { ...p.position, y: newY },
      size: { ...p.size, height: newH },
    }
  })
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
function round6(v: number): number {
  return Number(v.toFixed(6))
}

function remapPanel(panel: Panel, templatePanels: LayoutTemplate['panels'], index: number): Panel {
  // Cycle through template panels instead of always falling back to the last slot.
  // This prevents overlapping geometry when pages have more panels than the template defines.
  if (!templatePanels || templatePanels.length === 0) return panel

  const templatePanel = templatePanels[index % templatePanels.length]

  // Simply map the panel to the template slot. Any vertical normalization
  // across the entire page is handled by normalizePanelsVerticalCoverage.
  try {
    return {
      ...panel,
      position: { ...templatePanel.position },
      size: { ...templatePanel.size },
    }
  } catch {
    // fallback: return original panel unchanged
    return panel
  }
}
