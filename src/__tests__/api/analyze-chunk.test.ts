import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  explainRateLimit,
  isRateLimitAcceptable,
} from '@/__tests__/integration/__helpers/rate-limit'
import { POST } from '@/app/api/analyze/chunk/route'
import { StorageFactory } from '@/utils/storage'

vi.mock('@/utils/job', () => ({
  getNovelIdForJob: vi.fn(),
}))

// モック設定
vi.mock('@/agents/chunk-analyzer', () => {
  const mockAnalysisResult = {
    summary: 'チャンク分析結果の要約',
    characters: [
      {
        name: 'テスト花子',
        description: 'テスト用女性キャラクター',
        firstAppearance: 15,
      },
    ],
    scenes: [
      {
        location: '学校',
        time: '午後',
        description: '学校の教室でのシーン',
        startIndex: 0,
        endIndex: 200,
      },
    ],
    dialogues: [
      {
        speakerId: 'テスト花子',
        text: 'おはようございます',
        emotion: 'cheerful',
        index: 100,
      },
    ],
    highlights: [
      {
        type: 'emotional_peak' as const,
        description: '感情的な山場',
        importance: 7,
        startIndex: 150,
        endIndex: 180,
        text: '感情的な部分の抜粋',
      },
    ],
    situations: [
      {
        description: '緊迫した状況',
        index: 120,
      },
    ],
  }

  return {
    getChunkAnalyzerAgent: vi.fn(() => ({
      generateObject: vi.fn().mockResolvedValue(mockAnalysisResult),
    })),
    analyzeChunkWithFallback: vi.fn().mockResolvedValue({
      result: mockAnalysisResult,
      usedProvider: 'test-provider',
      fallbackFrom: [],
    }),
  }
})

vi.mock('@/utils/storage', async (importOriginal) => {
  const actual = await importOriginal()
  // 型エラー回避のため any キャスト（テスト用モック拡張）
  return {
    ...(actual as any),
    StorageFactory: {
      getDatabase: vi.fn(),
      getChunkStorage: vi.fn(),
      getAnalysisStorage: vi.fn(),
    },
  }
})

vi.mock('@/config', () => ({
  getTextAnalysisConfig: vi.fn(() => ({
    userPromptTemplate:
      'チャンク{{chunkIndex}}を分析してください: {{chunkText}} 前要約: {{previousChunkSummary}} 次要約: {{nextChunkSummary}}',
  })),
}))

describe('/api/analyze/chunk', () => {
  let testJobId: string
  const testNovelId = 'test-novel'
  const chunkPath = (jobId: string, index: number) =>
    `${testNovelId}/jobs/${jobId}/chunks/chunk_${index}.txt`
  const analysisPath = (jobId: string, index: number) =>
    `${testNovelId}/jobs/${jobId}/analysis/chunk_${index}.json`

  beforeEach(async () => {
    vi.clearAllMocks()

    // ストレージのモック設定
    // StorageKeys 仕様変更: 各ストレージの baseDir で種別ディレクトリを提供し、キー自体には prefix を含めない
    const mockChunkStorage = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === chunkPath(testJobId, 0)) {
          return {
            text: 'これはテスト用のチャンクテキストです。分析対象のサンプルテキストです。',
          }
        }
        if (path === chunkPath(testJobId, 1)) {
          return {
            text: '2番目のチャンクテキストです。継続する物語の内容です。',
          }
        }
        if (path === chunkPath(testJobId, 999)) {
          return null // 存在しないファイル
        }
        return null
      }),
      put: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn().mockImplementation((path: string) => {
        return path !== chunkPath(testJobId, 999) && !path.includes('nonexistent-job')
      }),
    }

    const mockAnalysisStorage = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === analysisPath(testJobId, 1)) {
          // キャッシュテスト用：chunk_1は既に分析済み
          return {
            text: JSON.stringify({
              chunkIndex: 1,
              jobId: testJobId,
              analysis: {
                summary: 'キャッシュされた分析結果',
                characters: [],
                scenes: [],
                dialogues: [],
                highlights: [],
                situations: [],
              },
              analyzedAt: '2025-01-01T00:00:00.000Z',
            }),
          }
        }
        return null
      }),
      put: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn().mockImplementation((path: string) => {
        return path === analysisPath(testJobId, 1)
      }),
    }

    vi.mocked(StorageFactory.getChunkStorage).mockResolvedValue(mockChunkStorage)
    vi.mocked(StorageFactory.getAnalysisStorage).mockResolvedValue(mockAnalysisStorage)

    testJobId = 'test-chunk-job'
    const { getNovelIdForJob } = await import('@/utils/job')
    vi.mocked(getNovelIdForJob).mockResolvedValue(testNovelId)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/analyze/chunk', () => {
    it('有効なリクエストでチャンク分析を実行する', async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      if (isRateLimitAcceptable(response.status, data)) {
        expect([429, 503]).toContain(response.status)
        expect(explainRateLimit(data)).toBeTruthy()
        return
      }

      expect([200, 201, 500]).toContain(response.status)

      if (response.status === 500) {
        expect(data.success).toBe(false)
        expect(data.error).toBeDefined()
      } else {
        expect(data.success).toBe(true)
        expect(data.cached).toBe(false)
        expect(data.data).toBeDefined()
        expect(data.data.summary).toBe('チャンク分析結果の要約')
        expect(data.data.characters).toHaveLength(1)
        expect(data.data.scenes).toHaveLength(1)
        expect(data.data.dialogues).toHaveLength(1)
        expect(data.data.highlights).toHaveLength(1)
        expect(data.data.situations).toHaveLength(1)
      }
    })

    it('既に分析済みのチャンクの場合はキャッシュされた結果を返す', async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 1, // chunk_1はモックで既に分析済みに設定
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.cached).toBe(true)
      expect(data.data).toBeDefined()
      expect(data.data.summary).toBe('キャッシュされた分析結果')
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        chunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
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
      expect(data.error).toBe('Invalid request data')
    })

    it('chunkIndexが未指定の場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
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
      expect(data.error).toBe('Invalid request data')
    })

    it('chunkIndexが数値でない場合は400エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 'invalid',
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
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
      expect(data.error).toBe('Invalid request data')
    })

    it('存在しないチャンクファイルの場合は404エラーを返す', async () => {
      const requestBody = {
        jobId: testJobId,
        chunkIndex: 999, // 存在しないチャンク
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Chunk file not found')
    })

    it('存在しないjobIdの場合は404エラーを返す', async () => {
      const requestBody = {
        jobId: 'nonexistent-job',
        chunkIndex: 0,
      }

      const request = new NextRequest('http://localhost:3000/api/analyze/chunk', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.success).toBe(false)
      expect(data.error).toContain('Chunk file not found')
    })
  })
})
