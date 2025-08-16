import type { LayoutTemplate } from '@/types/panel-layout'
import { layoutRules } from '@/utils/layout-templates'
import { Panel, type PanelInit } from './panel'

export class Page {
  public readonly pageNumber: number
  private panels: Panel[] = []

  constructor(pageNumber: number) {
    this.pageNumber = pageNumber
  }

  addPanel(panelData: PanelInit, template: LayoutTemplate): void {
    const style = template.panels[this.panels.length] || template.panels[0]

    // 重要度に応じてサイズを調整
    let sizeMultiplier = 1.0
    if (panelData.suggestedSize === 'extra-large') sizeMultiplier = 1.5
    else if (panelData.suggestedSize === 'large') sizeMultiplier = 1.2
    else if (panelData.suggestedSize === 'small') sizeMultiplier = 0.8

    const adjustedStyle = {
      position: style.position,
      size: {
        width: Math.min(style.size.width * sizeMultiplier, 1.0),
        height: Math.min(style.size.height * sizeMultiplier, 1.0),
      },
    }

    const panel = new Panel(this.panels.length + 1, panelData)
    panel.applyTemplate(adjustedStyle)
    this.panels.push(panel)
  }

  validateLayout(): boolean {
    const panelData = this.panels.map((p) => p.toJSON())
    if (panelData.length <= 1) {
      return true
    }
    if (layoutRules.forbidden.isEqualGrid(panelData)) {
      // サイズを微調整して均等分割を避ける
      this.panels.forEach((panel, i) => {
        const adjustment = 0.05 + i * 0.02
        const size = panel.size
        const newSize = {
          width: size.width + (i % 2 === 0 ? adjustment : -adjustment),
          height: size.height + (i % 2 === 1 ? adjustment : -adjustment),
        }
        panel.applyTemplate({ position: panel.position, size: newSize })
      })
      return false
    }
    return true
  }

  getPanels(): Readonly<Panel[]> {
    return this.panels
  }
}
