import { describe, expect, it } from 'vitest'
import { Page } from '@/domain/models/page'
import type { LayoutTemplate } from '@/types/panel-layout'

const template: LayoutTemplate = {
  name: 'test',
  description: 'test template',
  panelCount: 2,
  panels: [
    { position: { x: 0, y: 0 }, size: { width: 0.5, height: 0.5 }, priority: 1 },
    { position: { x: 0.5, y: 0 }, size: { width: 0.5, height: 0.5 }, priority: 1 },
  ],
}

describe('Page domain model', () => {
  it('adds panels using template and adjusts invalid layout', () => {
    const page = new Page(1)
    page.addPanel(
      {
        content: 'panel1',
        sourceChunkIndex: 0,
        importance: 5,
        suggestedSize: 'medium',
      },
      template,
    )
    page.addPanel(
      {
        content: 'panel2',
        sourceChunkIndex: 1,
        importance: 5,
        suggestedSize: 'medium',
      },
      template,
    )

    expect(page.getPanels()).toHaveLength(2)
    expect(page.getPanels()[0].position).toEqual(template.panels[0].position)

    const isValid = page.validateLayout()
    expect(isValid).toBe(false)
    const widths = page.getPanels().map((p) => p.size.width)
    expect(new Set(widths).size).toBeGreaterThan(1)
  })
})

