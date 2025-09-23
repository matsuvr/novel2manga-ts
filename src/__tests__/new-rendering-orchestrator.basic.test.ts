import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewRenderingOrchestrator } from '@/services/application/rendering/new-rendering-orchestrator'
import type { MangaLayout } from '@/types/panel-layout'

const mockPutPageRender = vi.fn(async () => {})
const mockPutPageThumbnail = vi.fn(async () => {})
vi.mock('@/infrastructure/storage/ports', () => ({
  getStoragePorts: () => ({
    render: {
      putPageRender: mockPutPageRender,
      putPageThumbnail: mockPutPageThumbnail,
    },
    layout: {},
  }),
}))

const makeLayout = (pages: number): MangaLayout => ({
  title: 't',
  author: 'a',
  created_at: new Date().toISOString(),
  episodeNumber: 1,
  episodeTitle: 'ep',
  pages: Array.from({ length: pages }, (_, i) => ({
    page_number: i + 1,
    panels: [
      {
        id: (i + 1) * 10,
        position: { x: 0.05, y: 0.05 },
        size: { width: 0.9, height: 0.9 },
        content: '',
        dialogues: [],
        sfx: [],
        sourceChunkIndex: 0,
        importance: 5,
      },
    ],
  })),
})

describe('NewRenderingOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it('renders all pages and reports counts + metrics + thumbnails', async () => {
    const layout = makeLayout(3)
    const orchestrator = new NewRenderingOrchestrator()
    const res = await orchestrator.renderMangaLayout(layout, { novelId: 'n1', jobId: 'j1', episode: 1 })
    expect(res.totalPages).toBe(3)
    expect(res.renderedPages).toBe(3)
    expect(res.errors.length).toBe(0)
    expect(mockPutPageRender).toHaveBeenCalledTimes(3)
    expect(mockPutPageThumbnail).toHaveBeenCalledTimes(3)
    expect(res.metrics).toBeDefined()
    expect(res.metrics?.thumbnails).toBe(3)
    expect(res.metrics?.dialogues).toBe(0)
    expect(res.metrics?.sfx).toBe(0)
    expect(res.metrics?.fallbackPages).toBeGreaterThanOrEqual(0)
  })
})
