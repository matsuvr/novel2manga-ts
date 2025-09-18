import { describe, expect, it, vi } from 'vitest'
import type { MangaLayout } from '@/types/panel-layout'

const mockTemplate = {
  name: 'mock-3-panel',
  description: 'Mock template with three slots',
  panelCount: 3,
  panels: [
    { position: { x: 0, y: 0 }, size: { width: 0.4, height: 0.4 }, priority: 1 },
    { position: { x: 0.6, y: 0 }, size: { width: 0.4, height: 0.4 }, priority: 2 },
    { position: { x: 0, y: 0.5 }, size: { width: 1, height: 0.5 }, priority: 3 },
  ],
} as const

vi.mock('@/utils/layout-templates', () => ({
  selectLayoutTemplateByCountRandom: vi.fn(() => mockTemplate),
}))

describe('applyTemplatesByPanelCount', () => {
  it('assigns template geometry to each page based on panel count', async () => {
    const { applyTemplatesByPanelCount } = await import('@/utils/layout-template-applier')
    const { selectLayoutTemplateByCountRandom } = await import('@/utils/layout-templates')

    const layout: MangaLayout = {
      title: 'Test',
      created_at: '2025-01-01',
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [
            {
              id: 1,
              position: { x: 0, y: 0 },
              size: { width: 1, height: 1 },
              content: 'p1',
            },
            {
              id: 2,
              position: { x: 0, y: 0 },
              size: { width: 1, height: 1 },
              content: 'p2',
            },
            {
              id: 3,
              position: { x: 0, y: 0 },
              size: { width: 1, height: 1 },
              content: 'p3',
            },
          ],
        },
      ],
    }

    const result = applyTemplatesByPanelCount(layout)

    expect(selectLayoutTemplateByCountRandom).toHaveBeenCalledWith(3)
    expect(result.pages[0].panels.map((panel) => panel.position)).toEqual(
      mockTemplate.panels.map((panel) => panel.position),
    )
    expect(result.pages[0].panels.map((panel) => panel.size)).toEqual(
      mockTemplate.panels.map((panel) => panel.size),
    )
  })
})
