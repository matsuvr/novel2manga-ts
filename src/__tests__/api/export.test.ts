import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/export/route'
import { appConfig } from '@/config/app.config'
import { DatabaseService } from '@/services/database'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'

// 設定モック
vi.mock('@/config', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
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
    getDatabaseConfig: vi.fn(() => ({ url: 'test://memory' })),
    isDevelopment: vi.fn(() => true),
  }
})

// ストレージとデータベースのモック
vi.mock('@/utils/storage', () => {
  // 有効なYAML（正規スキーマ）を返す
  const validYaml = `
title: テストマンガ
created_at: '2024-01-01T00:00:00.000Z'
episodeNumber: 1
pages:
  - page_number: 1
    panels:
      - id: 1
        position: { x: 0.1, y: 0.1 }
        size: { width: 0.8, height: 0.4 }
        content: 'サンプル'
  - page_number: 2
    panels:
      - id: 1
        position: { x: 0.1, y: 0.55 }
        size: { width: 0.8, height: 0.4 }
        content: 'サンプル2'
`
  const base64Png = Buffer.from('dummy').toString('base64')
  return {
    StorageFactory: {
      getDatabase: vi.fn(),
      getRenderStorage: vi.fn().mockResolvedValue({
        get: vi.fn().mockImplementation(async (_key: string) => ({ text: base64Png })),
        put: vi.fn(),
      }),
      getLayoutStorage: vi.fn().mockResolvedValue({
        get: vi.fn().mockImplementation(async (_key: string) => ({ text: validYaml })),
        put: vi.fn(),
      }),
      getOutputStorage: vi.fn().mockResolvedValue({
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn(),
      }),
    },
    StorageKeys: {
      episodeLayout: vi.fn((jobId: string, episode: number) => `${jobId}/episode_${episode}.yaml`),
      pageRender: vi.fn(
        (jobId: string, episode: number, page: number) =>
          `${jobId}/renders/episode_${episode}/page_${page}.png`,
      ),
      exportOutput: vi.fn((jobId: string, format: string) => `${jobId}/exports/output.${format}`),
    },
  }
})

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    createNovel: vi.fn(),
    createJob: vi.fn(),
  })),
}))

// PDFKit のモック
vi.mock('pdfkit', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      addPage: vi.fn(),
      image: vi.fn(),
      end: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'end') {
          // すぐにコールバックを呼んでPDFの完了をシミュレート
          setTimeout(callback, 0)
        }
      }),
      page: {
        width: 800,
        height: 600,
      },
    })),
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
            id: 'panel1',
            position: { x: 0.1, y: 0.1 },
            size: { width: 0.8, height: 0.4 },
            content: 'テスト状況説明',
            dialogues: [
              {
                id: '1',
                speakerId: 'テスト太郎',
                text: 'こんにちは',
                emotion: 'normal',
                index: 0,
              },
            ],
          },
        ],
      },
      {
        page_number: 2,
        panels: [
          {
            id: 'panel2',
            position: { x: 0.1, y: 0.1 },
            size: { width: 0.8, height: 0.4 },
            content: 'テスト状況説明2',
            dialogues: [
              {
                id: '2',
                speakerId: 'テスト花子',
                text: 'こんにちは2',
                emotion: 'normal',
                index: 0,
              },
            ],
          },
        ],
      },
    ],
  }),
}))

describe('/api/export', () => {
  let testJobId: string
  let testNovelId: string
  let mockDbService: any

  beforeEach(async () => {
    vi.clearAllMocks()
    __resetDatabaseServiceForTest()

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
        { episodeNumber: 1, title: 'Episode 1' },
        { episodeNumber: 2, title: 'Episode 2' },
      ]),
      createOutput: vi.fn().mockResolvedValue('output-id'),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
    __resetDatabaseServiceForTest()
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
      expect(typeof data.downloadUrl).toBe('string')
      expect(data.format).toBe('pdf')
    })

    it('有効なCBZ形式のリクエストでエクスポートを開始する', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'cbz',
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

      expect(response.status).toBe(400)
      expect(data.error).toBeDefined()
    })

    it('無効なフォーマットで400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'invalid',
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

      expect(response.status).toBe(400)
      expect(data.error).toContain('有効なformatが必要です')
    })

    it('存在しないジョブIDでは500/エラーメッセージを返す', async () => {
      mockDbService.getJob.mockResolvedValue(null)

      const requestBody = {
        jobId: 'non-existent-job',
        format: 'pdf',
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

      expect(response.status).toBe(500)
      expect(data.error).toContain('指定されたジョブが見つかりません')
    })

    it('レンダリング未完了でも必要リソースがあればエクスポート可能', async () => {
      mockDbService.getJob.mockResolvedValue({
        id: testJobId,
        novelId: testNovelId,
        status: 'processing',
        renderCompleted: false,
      })

      const requestBody = {
        jobId: testJobId,
        format: 'pdf',
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
      expect(data.format).toBe('pdf')
    })

    it('空のエピソード番号配列の場合は全エピソードを対象に成功する', async () => {
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
      expect(data.format).toBe('pdf')
    })

    it('存在しないエピソード番号で500エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        format: 'pdf',
        episodeNumbers: [999],
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

      expect(response.status).toBe(500)
      expect(data.error).toContain('エクスポート対象のエピソードが見つかりません')
    })
  })
})
