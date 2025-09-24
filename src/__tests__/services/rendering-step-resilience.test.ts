import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import { RenderingStep } from '@/services/application/steps/rendering-step'

// We stub storage ports to inject a crafted layout JSON with one invalid page
// Simple in-memory store for render outputs
const renderImages = new Map<string, Buffer>()
const layoutJsonByEpisode = new Map<string, string>()
const TEST_NOVEL_ID = 'novel-test'

vi.mock('@/infrastructure/storage/ports', () => ({
  getStoragePorts: () => ({
    layout: {
      getEpisodeLayout: async (novelId: string, jobId: string, ep: number) =>
        layoutJsonByEpisode.get(`${novelId}:${jobId}:${ep}`) || null,
      // unused in this test
      getEpisodeLayoutProgress: async () => null,
    },
    render: {
      putPageRender: async (
        novelId: string,
        jobId: string,
        ep: number,
        page: number,
        buf: Buffer,
      ) => {
        const k = `${novelId}:${jobId}:${ep}:${page}`
        renderImages.set(k, buf)
        return k
      },
      putPageThumbnail: async (
        novelId: string,
        jobId: string,
        ep: number,
        page: number,
        buf: Buffer,
      ) => {
        const k = `${novelId}:${jobId}:${ep}:thumb:${page}`
        renderImages.set(k, buf)
        return k
      },
      getPageRender: async (novelId: string, jobId: string, ep: number, page: number) => {
        const k = `${novelId}:${jobId}:${ep}:${page}`
        const v = renderImages.get(k)
        return v ? { text: v.toString('base64') } : null
      },
      // thumbnails not needed for assertions
    },
  }),
}))
const updateProcessingPositionMock = vi.fn()
const upsertRenderStatusMock = vi.fn()

vi.mock('@/services/database', async () => {
  const actual = await vi.importActual<object>('@/services/database/index')
  return {
    ...actual,
    db: {
      jobs: () => ({
        getJob: vi.fn().mockResolvedValue({ id: 'job-test', novelId: TEST_NOVEL_ID }),
        updateProcessingPosition: updateProcessingPositionMock,
      }),
      render: () => ({
        upsertRenderStatus: upsertRenderStatusMock,
      }),
    },
  }
})

// Mock page renderer to avoid heavy canvas work
vi.mock('@/lib/canvas/manga-page-renderer', () => ({
  MangaPageRenderer: {
    create: vi.fn(async () => ({
      pageWidth: 800,
      pageHeight: 1200,
      renderToImage: vi.fn(async () => new Blob([Buffer.from('fake', 'utf-8')], { type: 'image/png' })),
      cleanup: vi.fn(),
    })),
  },
}))

vi.mock('@/lib/canvas/thumbnail-generator', () => ({
  ThumbnailGenerator: {
    generateThumbnail: vi.fn(async () => new Blob([Buffer.from('thumb', 'utf-8')], { type: 'image/jpeg' })),
  },
}))

vi.mock('@/utils/layout-normalizer', () => ({
  normalizeAndValidateLayout: vi.fn((layout: any) => ({ layout, pageIssues: {} })),
}))

describe('RenderingStep resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateProcessingPositionMock.mockClear()
    upsertRenderStatusMock.mockClear()
    renderImages.clear()
    layoutJsonByEpisode.clear()
  })

  it('continues rendering remaining pages when one page has invalid panels', async () => {
    const jobId = 'job-test'
    const episodeNumber = 1
    const validPage = {
      page_number: 1,
      panels: [
        {
          id: 1,
          position: { x: 0, y: 0 },
          size: { width: 400, height: 400 },
          content: 'ok',
          dialogues: [],
        },
      ],
    }
    const invalidPage = {
      page_number: 2,
      panels: [
        {
          id: 1,
          position: { x: 0, y: 0 },
          size: { width: 0, height: 200 }, // invalid width triggers skip
          content: 'bad',
          dialogues: [],
        },
      ],
    }
    const laterPage = {
      page_number: 3,
      panels: [
        {
          id: 1,
          position: { x: 0, y: 0 },
          size: { width: 400, height: 400 },
          content: 'ok2',
          dialogues: [],
        },
      ],
    }

    // Inject layout JSON directly
    layoutJsonByEpisode.set(
      `${TEST_NOVEL_ID}:${jobId}:${episodeNumber}`,
      JSON.stringify({
        title: 'Test',
        created_at: new Date().toISOString(),
        episodeNumber,
        pages: [validPage, invalidPage, laterPage],
      }),
    )

    const step = new RenderingStep()
    const result = await step.renderEpisodes([episodeNumber], { isDemo: false }, {
      jobId,
      novelId: TEST_NOVEL_ID,
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        withContext() { return this },
      },
    } as any)

    expect(result.success).toBe(true)
    // Renderer called for valid pages (1 and 3) but not for skipped invalid 2
    const ports = getStoragePorts()
  const page1 = await ports.render.getPageRender(TEST_NOVEL_ID, jobId, episodeNumber, 1)
  const page2 = await ports.render.getPageRender(TEST_NOVEL_ID, jobId, episodeNumber, 2)
  const page3 = await ports.render.getPageRender(TEST_NOVEL_ID, jobId, episodeNumber, 3)

    expect(page1).not.toBeNull()
    expect(page2).toBeNull() // skipped
    expect(page3).not.toBeNull()

    expect(updateProcessingPositionMock).toHaveBeenCalledTimes(2)
    expect(updateProcessingPositionMock).toHaveBeenNthCalledWith(1, jobId, { episode: episodeNumber, page: 1 })
    expect(updateProcessingPositionMock).toHaveBeenNthCalledWith(2, jobId, { episode: episodeNumber, page: 3 })
    expect(upsertRenderStatusMock).toHaveBeenCalledTimes(2)
    expect(upsertRenderStatusMock).toHaveBeenNthCalledWith(1, jobId, episodeNumber, 1, expect.objectContaining({ isRendered: true, imagePath: expect.any(String) }))
    expect(upsertRenderStatusMock).toHaveBeenNthCalledWith(2, jobId, episodeNumber, 3, expect.objectContaining({ isRendered: true, imagePath: expect.any(String) }))
  })
})
