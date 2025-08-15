import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/export/route'
import { appConfig } from '@/config/app.config'
import { DatabaseService } from '@/services/database'

// ストレージとデータベースのモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getDatabase: vi.fn(),
    getRenderStorage: vi.fn().mockResolvedValue({
      get: vi.fn().mockResolvedValue({
        text: 'mock-yaml-layout',
      }),
    }),
    getOutputStorage: vi.fn().mockResolvedValue({
      put: vi.fn().mockResolvedValue(undefined),
    }),
  },
  StorageKeys: {
    episodeLayout: vi.fn((jobId, episode) => `layouts/${jobId}/episode_${episode}.yaml`),
    pageRender: vi.fn(
      (jobId, episode, page) => `renders/${jobId}/episode_${episode}/page_${page}.png`,
    ),
    exportOutput: vi.fn((jobId, format) => `exports/${jobId}/output.${format}`),
  },
}))

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
  })),
}))

// PDFKit のモック
vi.mock('pdfkit', () => {
  const mockDoc = {
    addPage: vi.fn(),
    image: vi.fn(),
    end: vi.fn(),
    on: vi.fn((event, callback) => {
      if (event === 'end') {
        // すぐにコールバックを呼んでPDFの完了をシミュレート
        setTimeout(callback, 0)
      }
    }),
    page: { width: appConfig.rendering.defaultPageSize.width, height: appConfig.rendering.defaultPageSize.height },
  }
  return {
    default: vi.fn(() => mockDoc),
  }
})

// JSZip のモック
vi.mock('jszip', () => ({
  default: vi.fn().mockImplementation(() => ({
    folder: vi.fn().mockReturnValue({
      file: vi.fn(),
    }),
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue(Buffer.from('mock-zip-data')),
  })),
}))

// yaml パーサーのモック
vi.mock('yaml', () => ({
  parse: vi.fn().mockReturnValue({
    pages: [{ page_number: 1 }, { page_number: 2 }],
  }),
}))

describe('/api/export', () => {
  let testJobId: string
  let testNovelId: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-export-job'
    testNovelId = 'test-novel-id'

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      getJob: vi.fn().mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'completed',
        renderCompleted: true,
      }),
      getEpisodesByJobId: vi.fn().mockResolvedValue([
        { episodeNumber: 1, title: 'Episode 1', estimatedPages: 3 },
        { episodeNumber: 2, title: 'Episode 2', estimatedPages: 4 },
      ]),
      createOutput: vi.fn().mockResolvedValue('output-id'),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/export', () => {
    it('有効なPDF形式のリクエストでエクスポートを開始する', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'pdf',
        episodeNumbers: [1, 2],
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
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
      expect(data.message).toBe('PDF形式でのエクスポートが完了しました')
      expect(data.jobId).toBe(testJobId)
      expect(data.format).toBe('pdf')
      expect(data.downloadUrl).toMatch(/\/api\/export\/download\//)
    })

    it('有効なZIP形式のリクエストでエクスポートを開始する', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'images_zip',
        episodeNumbers: [1],
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
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
      expect(data.format).toBe('images_zip')
      expect(data.message).toBe('IMAGES_ZIP形式でのエクスポートが完了しました')
      expect(data.downloadUrl).toMatch(/\/api\/export\/download\//)
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        format: 'pdf',
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('jobIdが必要です')
    })

    it('formatが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('有効なformatが必要です（pdf, images_zip）')
    })

    it('formatが無効な場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'invalid_format',
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('有効なformatが必要です（pdf, images_zip）')
    })

    it('存在しないジョブIDの場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: 'nonexistent-job',
        format: 'pdf',
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.success).toBe(false)
      expect(data.error).toBe('指定されたジョブが見つかりません')
    })

    it('全ての形式で正常に処理されることを確認', async () => {
      const formats = ['pdf', 'images_zip']

      for (const format of formats) {
        const requestBody = {
          jobId: testJobId,
          format,
        }

        const request = new NextRequest('http://localhost:3000/api/export', {
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
        expect(data.format).toBe(format)
      }
    })

    it('episodeNumbersが配列として渡される', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'pdf',
        episodeNumbers: [1, 2, 3, 4, 5],
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
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
    })

    it('episodeNumbersが空配列でも正常に処理される', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'pdf',
        episodeNumbers: [],
      }

      const request = new NextRequest('http://localhost:3000/api/export', {
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
    })
  })
})
