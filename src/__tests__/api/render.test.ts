import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/render/route'
import { DatabaseService } from '@/services/database'
import type { MangaLayout } from '@/types/panel-layout'

// ストレージとデータベースのモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
  },
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
    createEpisode: vi.fn(),
  })),
}))

// 開発環境をモック
vi.mock('@/config', () => ({
  isDevelopment: vi.fn(() => true),
  getConfig: vi.fn(() => ({
    get: vi.fn((key: string) => {
      if (key === 'database') {
        return { path: '.test-storage/database.sqlite' }
      }
      return {}
    }),
  })),
}))

// MangaPageRendererをモック
vi.mock('@/lib/canvas/manga-page-renderer', () => ({
  MangaPageRenderer: vi.fn().mockImplementation(() => ({
    renderToImage: vi.fn().mockResolvedValue(new Blob(['mock-image-data'], { type: 'image/png' })),
  })),
}))

// node-canvasをモック（サーバーサイドテスト用）
vi.mock('canvas', () => ({
  createCanvas: vi.fn().mockReturnValue({
    getContext: vi.fn().mockReturnValue({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
    }),
    toBuffer: vi.fn().mockImplementation((callback) => {
      callback(null, Buffer.from('mock-canvas-buffer'))
    }),
    width: 842,
    height: 595,
  }),
}))

describe('/api/render', () => {
  let testJobId: string
  let testNovelId: string
  let testDir: string
  let mockDbService: any

  // テスト用のマンガレイアウト
  const mockMangaLayout: MangaLayout = {
    title: 'テストマンガ',
    author: 'テスト作者',
    created_at: '2024-01-01T00:00:00.000Z',
    episodeNumber: 1,
    episodeTitle: 'テストエピソード',
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 1,
            position: { x: 0.1, y: 0.1 },
            size: { width: 0.8, height: 0.4 },
            content: 'テスト状況説明',
            dialogues: [
              {
                speaker: 'character1',
                text: 'こんにちは',
                emotion: 'normal',
              },
            ],
          },
          {
            id: 2,
            position: { x: 0.1, y: 0.5 },
            size: { width: 0.8, height: 0.4 },
            content: 'テスト状況説明2',
          },
        ],
      },
    ],
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-job-render'
    testNovelId = 'test-novel-id'

    // テスト用ディレクトリを作成
    testDir = path.join(process.cwd(), '.test-storage')
    await fs.mkdir(testDir, { recursive: true })

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      createEpisode: vi.fn(),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テストディレクトリのクリーンアップ
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (_error) {
      // エラーは無視
    }
  })

  describe('POST /api/render', () => {
    it('有効なリクエストでページレンダリングが成功する', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: `title: テストマンガ
author: テスト作者
created_at: '2024-01-01T00:00:00.000Z'
episodeNumber: 1
episodeTitle: テストエピソード
pages:
  - page_number: 1
    panels:
      - id: 1
        position:
          x: 0.1
          y: 0.1
        size:
          width: 0.8
          height: 0.4
        content: テスト状況説明
        dialogues:
          - speaker: character1
            text: こんにちは
            emotion: normal`,
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
      expect(data.message).toBe('ページのレンダリングが完了しました')
      expect(data.jobId).toBe(testJobId)
      expect(data.episodeNumber).toBe(1)
      expect(data.pageNumber).toBe(1)
      expect(data.renderKey).toBeDefined()
      expect(data.fileSize).toBeGreaterThan(0)
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: 'valid yaml content',
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
      expect(data.error).toBe('jobIdが必要です')
    })

    it('episodeNumberが無効な場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 0, // 無効な値
        pageNumber: 1,
        layoutYaml: 'valid yaml content',
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
      expect(data.error).toBe('有効なepisodeNumberが必要です')
    })

    it('pageNumberが無効な場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 0, // 無効な値
        layoutYaml: 'valid yaml content',
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
      expect(data.error).toBe('有効なpageNumberが必要です')
    })

    it('layoutYamlが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 1,
        // layoutYamlが未指定
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
      expect(data.error).toBe('layoutYamlが必要です')
    })

    it('無効なYAML形式の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: 'invalid: yaml: content: [unclosed',
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
      expect(data.error).toBe('無効なYAML形式です')
    })

    it('存在しないジョブIDの場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: 'nonexistent-job',
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: `title: テスト
pages:
  - page_number: 1
    panels: []`,
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

    it('存在しないエピソード番号の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 999, // 存在しないエピソード
        pageNumber: 1,
        layoutYaml: `title: テスト
pages:
  - page_number: 1
    panels: []`,
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
      expect(data.error).toBe('エピソード 999 が見つかりません')
    })

    it('レイアウトにpages配列がない場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 1,
        layoutYaml: `title: テスト
author: テスト作者
# pages配列が無い`,
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
      expect(data.error).toBe('レイアウトにpages配列が必要です')
    })

    it('指定されたページ番号が存在しない場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        episodeNumber: 1,
        pageNumber: 999, // 存在しないページ
        layoutYaml: `title: テスト
pages:
  - page_number: 1
    panels: []`,
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
      expect(data.error).toBe('ページ 999 が見つかりません')
    })
  })
})
