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

  it('cycles template panels when page has more panels than the template', async () => {
    const { applyTemplatesByPanelCount } = await import('@/utils/layout-template-applier')

    const layout: MangaLayout = {
      title: 'Test Extra',
      created_at: '2025-01-01',
      episodeNumber: 1,
      pages: [
        {
          page_number: 1,
          panels: [
            { id: 1, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'a' },
            { id: 2, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'b' },
            { id: 3, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'c' },
            { id: 4, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'd' },
          ],
        },
      ],
    }

    const result = applyTemplatesByPanelCount(layout)

    // Expect cycling: indices 0..3 map to template panels 0,1,2,0
    expect(result.pages[0].panels[0].position).toEqual(mockTemplate.panels[0].position)
    expect(result.pages[0].panels[1].position).toEqual(mockTemplate.panels[1].position)
    expect(result.pages[0].panels[2].position).toEqual(mockTemplate.panels[2].position)
    expect(result.pages[0].panels[3].position).toEqual(mockTemplate.panels[0].position)
  })

  it('leaves page with zero panels unchanged', async () => {
    const { applyTemplatesByPanelCount } = await import('@/utils/layout-template-applier')

    const layout: MangaLayout = {
      title: 'Empty',
      created_at: '2025-01-01',
      episodeNumber: 2,
      pages: [
        {
          page_number: 1,
          panels: [],
        },
      ],
    }

    const result = applyTemplatesByPanelCount(layout)
    expect(result.pages[0].panels).toEqual([])
  })

  it('applies different templates per page for multi-page layouts', async () => {
    const { applyTemplatesByPanelCount } = await import('@/utils/layout-template-applier')
    const { selectLayoutTemplateByCountRandom } = await import('@/utils/layout-templates')

    // adjust mock to return different templates based on requested count
    ;(selectLayoutTemplateByCountRandom as unknown as any).mockImplementation((count: number) => {
      if (count === 1) return { ...mockTemplate, panels: [mockTemplate.panels[0]] }
      if (count === 2) return { ...mockTemplate, panels: [mockTemplate.panels[0], mockTemplate.panels[1]] }
      return mockTemplate
    })

    const layout: MangaLayout = {
      title: 'Multi',
      created_at: '2025-01-01',
      episodeNumber: 3,
      pages: [
        { page_number: 1, panels: [{ id: 1, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p1' }] },
        { page_number: 2, panels: [
            { id: 2, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p2' },
            { id: 3, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p3' },
          ] },
        { page_number: 3, panels: [
            { id: 4, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p4' },
            { id: 5, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p5' },
            { id: 6, position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: 'p6' },
          ] },
      ],
    }

    const result = applyTemplatesByPanelCount(layout)

    // Page1 should have used the 1-panel template
    expect(result.pages[0].panels[0].position).toEqual(mockTemplate.panels[0].position)
    // Page2 should use first two template positions
    expect(result.pages[1].panels[0].position).toEqual(mockTemplate.panels[0].position)
    expect(result.pages[1].panels[1].position).toEqual(mockTemplate.panels[1].position)
    // Page3 should match full mockTemplate mapping (cycled as needed)
    expect(result.pages[2].panels[2].position).toEqual(mockTemplate.panels[2].position)
  })
})
