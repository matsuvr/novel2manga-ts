import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as BatchPOST } from '@/app/api/render/batch/route'
import { POST } from '@/app/api/render/route'
import { appConfig } from '@/config/app.config'
import { MangaPageRenderer } from '@/lib/canvas/manga-page-renderer'
import { ThumbnailGenerator } from '@/lib/canvas/thumbnail-generator'
import { DatabaseService } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

// モック設定
vi.mock('@/services/database')
vi.mock('@/utils/storage')
vi.mock('@/lib/canvas/manga-page-renderer')
vi.mock('@/lib/canvas/thumbnail-generator')

const mockDbService = {
  getJob: vi.fn(),
  getEpisodesByJobId: vi.fn(),
  updateRenderStatus: vi.fn(),
}

const mockStorage = {
  put: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
}

const mockRenderer = {
  renderToImage: vi.fn(),
}

const _mockThumbnailGenerator = {
  generateThumbnail: vi.fn(),
}

const mockJob = {
  id: 'test-job-1',
  novelId: 'test-novel-1',
  status: 'processing',
}

const mockEpisodes = [
  {
    id: 'episode-1',
    episodeNumber: 1,
    title: 'テストエピソード',
  },
]

const validLayoutYaml = `
title: "テストマンガ"
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: "panel1"
        position: { x: 0, y: 0 }
        size: { width: 1, height: 1 }
        content: "テスト内容"
        dialogues: []
`

describe('/api/render エンドポイント', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // DatabaseServiceのモック設定
    vi.mocked(DatabaseService).mockImplementation(() => mockDbService as any)
    mockDbService.getJob.mockResolvedValue(mockJob)
    mockDbService.getEpisodesByJobId.mockResolvedValue(mockEpisodes)
    mockDbService.updateRenderStatus.mockResolvedValue(undefined)

    // StorageFactoryのモック設定
    vi.mocked(StorageFactory.getRenderStorage).mockResolvedValue(mockStorage as any)

    // MangaPageRendererのモック設定
    const mockBlob = new Blob(['fake image data'], { type: 'image/png' })
    vi.mocked(MangaPageRenderer).mockImplementation(() => mockRenderer as any)
    mockRenderer.renderToImage.mockResolvedValue(mockBlob)

    // ThumbnailGeneratorのモック設定
    const mockThumbnailBlob = new Blob(['fake thumbnail data'], { type: 'image/jpeg' })
    vi.mocked(ThumbnailGenerator.generateThumbnail).mockResolvedValue(mockThumbnailBlob)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('単一ページレンダリング', () => {
    it('正常なリクエストでレンダリングが成功する', async () => {
      const request = new Request('http://localhost/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'test-job-1',
          episodeNumber: 1,
          pageNumber: 1,
          layoutYaml: validLayoutYaml,
        }),
      })

      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.jobId).toBe('test-job-1')
      expect(data.episodeNumber).toBe(1)
      expect(data.pageNumber).toBe(1)
      expect(data.renderKey).toBeDefined()
      expect(data.thumbnailKey).toBeDefined()

      // データベース更新が呼ばれたことを確認
      expect(mockDbService.updateRenderStatus).toHaveBeenCalledWith('test-job-1', 1, 1, {
        isRendered: true,
        imagePath: expect.any(String),
        thumbnailPath: expect.any(String),
        width: appConfig.rendering.defaultPageSize.width,
        height: appConfig.rendering.defaultPageSize.height,
        fileSize: expect.any(Number),
      })

      // ストレージ保存が呼ばれたことを確認（画像 + サムネイル）
      expect(mockStorage.put).toHaveBeenCalledTimes(2)
    })

    it('無効なjobIdでエラーが返される', async () => {
      mockDbService.getJob.mockResolvedValue(null)

      const request = new Request('http://localhost/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'invalid-job',
          episodeNumber: 1,
          pageNumber: 1,
          layoutYaml: validLayoutYaml,
        }),
      })

      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('ジョブが見つかりません')
    })

    it('無効なYAMLでエラーが返される', async () => {
      const request = new Request('http://localhost/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'test-job-1',
          episodeNumber: 1,
          pageNumber: 1,
          layoutYaml: 'invalid yaml content [[[',
        }),
      })

      const response = await POST(request as any)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('無効なYAML形式')
    })
  })

  describe('バッチレンダリング', () => {
    it('複数ページのバッチレンダリングが成功する', async () => {
      const multiPageYaml =
        validLayoutYaml +
        `
  - page_number: 2
    panels:
      - id: "panel2"
        position: { x: 0, y: 0 }
        size: { width: 1, height: 1 }
        content: "テスト内容2"
        dialogues: []`

      const request = new Request('http://localhost/api/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'test-job-1',
          episodeNumber: 1,
          layoutYaml: multiPageYaml,
          pages: [1, 2],
          options: {
            concurrency: 2,
            skipExisting: false,
          },
        }),
      })

      const response = await BatchPOST(request as any)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.totalPages).toBe(2)
      expect(data.renderedPages).toBe(2)
      expect(data.failedPages).toBe(0)
      expect(data.results).toHaveLength(2)

      // 各ページの結果を確認
      expect(data.results[0].pageNumber).toBe(1)
      expect(data.results[0].status).toBe('success')
      expect(data.results[1].pageNumber).toBe(2)
      expect(data.results[1].status).toBe('success')
    })

    it('既存ページのスキップが正しく動作する', async () => {
      // 1ページ目が既に存在する状況をモック
      mockStorage.exists.mockImplementation((key: string) =>
        Promise.resolve(key.includes('page_1')),
      )

      const request = new Request('http://localhost/api/render/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 'test-job-1',
          episodeNumber: 1,
          layoutYaml: validLayoutYaml,
          pages: [1],
          options: {
            concurrency: 1,
            skipExisting: true,
          },
        }),
      })

      const response = await BatchPOST(request as any)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.skippedPages).toBe(1)
      expect(data.renderedPages).toBe(0)
      expect(data.results[0].status).toBe('skipped')
    })
  })
})
