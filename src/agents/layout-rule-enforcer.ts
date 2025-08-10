import { layoutRules } from '@/utils/layout-templates'
import type { Panel } from '@/types/panel-layout'

export class LayoutRuleEnforcer {
  enforce(panels: Panel[]) {
    if (layoutRules.forbidden.isEqualGrid(panels)) {
      console.warn('Page has equal grid layout, adjusting...')
      panels.forEach((panel, i) => {
        const adjustment = 0.05 + i * 0.02
        panel.size.width += i % 2 === 0 ? adjustment : -adjustment
        panel.size.height += i % 2 === 1 ? adjustment : -adjustment
      })
    }
  }
}
