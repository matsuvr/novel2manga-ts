import type { MangaLayout, Panel } from '@/types/panel-layout'
import { selectLayoutTemplateByCountRandom } from '@/utils/layout-templates'

/**
 * Apply a random layout template (drawn from bundled samples) to each page based on its panel count.
 * The panel order in the input layout is preserved, but their positions/sizes are replaced by the
 * corresponding template slots. If no sample template is available, the fallback generator from
 * selectLayoutTemplateByCountRandom provides a deterministic grid layout.
 */
export function applyTemplatesByPanelCount(layout: MangaLayout): MangaLayout {
  const pages = layout.pages.map((page) => {
    const panelCount = page.panels?.length ?? 0
    if (!panelCount) return page

    const template = selectLayoutTemplateByCountRandom(panelCount)
    const templatePanels = template.panels
    if (templatePanels.length === 0) return page

    const remappedPanels = page.panels.map((panel, index) => remapPanel(panel, templatePanels, index))
    return { ...page, panels: remappedPanels }
  })

  return { ...layout, pages }
}

function remapPanel(panel: Panel, templatePanels: PanelTemplateShape, index: number): Panel {
  const templatePanel = templatePanels[index] ?? templatePanels[templatePanels.length - 1]
  if (!templatePanel) {
    return panel
  }

  return {
    ...panel,
    position: { ...templatePanel.position },
    size: { ...templatePanel.size },
  }
}

type PanelTemplateShape = Array<{ position: Panel['position']; size: Panel['size'] }>
