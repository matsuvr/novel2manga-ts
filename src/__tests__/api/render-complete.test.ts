import { NextRequest } from 'next/server'
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
vi.mock('@/services/db-factory', () => ({
  getDatabaseService: () => new (DatabaseService as unknown as any)(),
  __resetDatabaseServiceForTest: vi.fn(),
}))

// 設定モック
vi.mock('@/config', () => ({
  getScriptConversionConfig: vi.fn(() => ({
    systemPrompt: 'script-system',
    userPromptTemplate: 'Episode: {{episodeText}}',
  })),
  getLLMProviderConfig: vi.fn(() => ({
    apiKey: 'test-key',
    model: 'test-model',
    maxTokens: 1000,
  })),
  getLLMDefaultProvider: vi.fn(() => 'openai'),
}))

const mockDbService = {
  getJob: vi.fn(),
  getEpisodesByJobId: vi.fn(),
  updateRenderStatus: vi.fn(),
  updateProcessingPosition: vi.fn(),
}

// DatabaseService モックの実装を上書き
vi.mocked(DatabaseService).mockImplementation(() => mockDbService as any)

const mockStorage = {
  put: vi.fn(),
  exists: vi.fn().mockResolvedValue(false),
}

const mockRenderer = {
  renderToImage: vi.fn(),
  cleanup: vi.fn(),
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
author: "テスト作者"
created_at: "2024-01-01T00:00:00.000Z"
episodeNumber: 1
episodeTitle: "テストエピソード"
pages:
  - page_number: 1
    panels:
      - id: "panel1"
        position:
          x: 0.1
          y: 0.1
        size:
          width: 0.8
          height: 0.4
        content: "テスト内容"
        dialogues:
          - speaker: "テスト太郎"
            text: "こんにちは"
            emotion: "normal"
  - page_number: 2
    panels:
      - id: "panel2"
        position:
          x: 0.1
          y: 0.1
        size:
          width: 0.8
          height: 0.4
        content: "テスト内容2"
        dialogues:
          - speaker: "テスト花子"
            text: "さようなら"
            emotion: "sad"
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
    vi.mocked(MangaPageRenderer).create = vi.fn().mockResolvedValue(mockRenderer as any)
    mockRenderer.renderToImage.mockResolvedValue(mockBlob)
    mockRenderer.cleanup = vi.fn()

    // ThumbnailGeneratorのモック設定
    const mockThumbnailBlob = new Blob(['fake thumbnail data'], { type: 'image/jpeg' })
    vi.mocked(ThumbnailGenerator.generateThumbnail).mockResolvedValue(mockThumbnailBlob)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('単一ページレンダリング', () => {
    it('正常なリクエストでレンダリングが成功する', async () => {
      const requestBody = {
        jobId: 'test-job-1',
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: validLayoutYaml,
      }

      const request = new NextRequest('http://localhost:3000/api/render', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.jobId).toBe('test-job-1')
      expect(data.episodeNumber).toBe(1)
      expect(data.pageNumber).toBe(1)
    })

    it('無効なjobIdでエラーが返される', async () => {
      mockDbService.getJob.mockResolvedValue(null)

      const requestBody = {
        jobId: 'invalid-job',
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: validLayoutYaml,
      }

      const request = new NextRequest('http://localhost:3000/api/render', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('指定されたジョブが見つかりません')
    })

    it('無効なYAMLでエラーが返される', async () => {
      const requestBody = {
        jobId: 'test-job-1',
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: 'invalid: yaml: content',
      }

      const request = new NextRequest('http://localhost:3000/api/render', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(String(data.error)).toContain('Invalid layout')
    })
  })

  describe('バッチレンダリング', () => {
    it('複数ページのバッチレンダリングが成功する', async () => {
      const requestBody = {
        jobId: 'test-job-1',
        episodeNumber: 1,
        pages: [1, 2],
        layoutYaml: validLayoutYaml,
      }

      const request = new NextRequest('http://localhost:3000/api/render/batch', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await BatchPOST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.success).toBe(true)
      expect(data.totalPages).toBe(2)
      expect(data.renderedPages).toBe(2)
      expect(data.failedPages).toBe(0)
      expect(data.results).toHaveLength(2)
      expect(data.results[0].status).toBe('success')
      expect(data.results[1].status).toBe('success')
    })

    it('skipExisting指定時も現実装はスキップせずレンダリングする', async () => {
      const requestBody = {
        jobId: 'test-job-1',
        episodeNumber: 1,
        pages: [1],
        layoutYaml: validLayoutYaml,
        skipExisting: true,
      }

      const request = new NextRequest('http://localhost:3000/api/render/batch', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await BatchPOST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.skippedPages).toBe(0)
      expect(data.renderedPages).toBe(1)
      expect(data.results[0].status).toBe('success')
    })
  })
})
