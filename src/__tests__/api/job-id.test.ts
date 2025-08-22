import fs from 'node:fs/promises'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/job/[id]/route'
import { DatabaseService } from '@/services/database'

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
    createChunk: vi.fn(),
    getJob: vi.fn(),
  })),
}))

// 開発環境をモック
vi.mock('node:process', () => ({
  env: {
    NODE_ENV: 'test',
  },
}))

describe('/api/job/[id]', () => {
  let testJobId: string
  let testNovelId: string
  let testDir: string
  let mockDbService: {
    createNovel: ReturnType<typeof vi.fn>
    createJob: ReturnType<typeof vi.fn>
    createChunk: ReturnType<typeof vi.fn>
    getNovel: ReturnType<typeof vi.fn>
    getJob: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    testJobId = 'test-job-detail'
    testNovelId = 'test-novel-id'

    // テスト用ディレクトリを作成
    testDir = path.join(process.cwd(), '.test-storage')
    await fs.mkdir(testDir, { recursive: true })

    // モックサービスの設定
    mockDbService = {
      createNovel: vi.fn().mockResolvedValue(testNovelId),
      createJob: vi.fn(),
      createChunk: vi.fn(),
      getNovel: vi.fn().mockResolvedValue(null),
      getJob: vi.fn().mockImplementation((id: string) => {
        if (id === testJobId) {
          return Promise.resolve({
            id: testJobId,
            novelId: testNovelId,
            status: 'completed',
            currentStep: 'complete',
          })
        }
        return Promise.resolve(null)
      }),
    }

    vi.mocked(DatabaseService).mockReturnValue(mockDbService)
  })

  afterEach(async () => {
    // テストディレクトリのクリーンアップ
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      console.warn('Failed to clean up test directory:', {
        testDir,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  })

  describe('GET /api/job/[id]', () => {
    it('本番環境では有効なジョブIDでジョブ詳細を取得する', async () => {
      // 本番環境をモック
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const request = new NextRequest('http://localhost:3000/api/job/test-job-detail')
      const params = { id: testJobId }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.job).toBeDefined()
      expect(data.job.id).toBe(testJobId)
      expect(data.chunks).toBeDefined()
      expect(data.chunks).toHaveLength(2)
      expect(data.chunks[0].jobId).toBe(testJobId)
      expect(data.chunks[1].jobId).toBe(testJobId)

      // 環境変数を復元
      process.env.NODE_ENV = originalEnv
    })

    it('開発環境では有効なジョブIDでローカルファイルからジョブ詳細を取得する', async () => {
      // 開発環境をモック
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      // ローカルストレージ用のテストデータを準備
      const localJobsDir = path.join(testDir, 'jobs')
      const localChunksDir = path.join(testDir, 'chunks', testJobId)
      await fs.mkdir(localJobsDir, { recursive: true })
      await fs.mkdir(localChunksDir, { recursive: true })

      // ジョブファイルを作成
      const jobData = {
        id: testJobId,
        novelId: testNovelId,
        title: 'ローカルテストジョブ',
        status: 'completed',
        createdAt: new Date().toISOString(),
      }
      await fs.writeFile(
        path.join(localJobsDir, `${testJobId}.json`),
        JSON.stringify(jobData, null, 2),
      )

      // チャンクファイルを作成
      await fs.writeFile(path.join(localChunksDir, 'chunk_0.txt'), 'チャンク0の内容です')
      await fs.writeFile(path.join(localChunksDir, 'chunk_1.txt'), 'チャンク1の内容です')

      const request = new NextRequest('http://localhost:3000/api/job/test-job-detail')
      const params = { id: testJobId }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.job).toBeDefined()
      expect(data.job.id).toBe(testJobId)
      expect(data.chunks).toBeDefined()
      expect(data.chunks).toHaveLength(2)
      expect(data.chunks[0].content).toBe('チャンク0の内容です')
      expect(data.chunks[1].content).toBe('チャンク1の内容です')

      // 環境変数を復元
      process.env.NODE_ENV = originalEnv
    })

    it('jobIdが未指定の場合は400エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/job/')
      const params = { id: '' }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toContain('ジョブIDが指定されていません')
    })

    it('本番環境で存在しないジョブIDの場合は404エラーを返す', async () => {
      // 本番環境をモック
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const request = new NextRequest('http://localhost:3000/api/job/nonexistent-job')
      const params = { id: 'nonexistent-job' }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('ジョブが見つかりません')

      // 環境変数を復元
      process.env.NODE_ENV = originalEnv
    })

    it('開発環境で存在しないジョブファイルの場合は404エラーを返す', async () => {
      // 開発環境をモック
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'

      const request = new NextRequest('http://localhost:3000/api/job/nonexistent-job')
      const params = { id: 'nonexistent-job' }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('ジョブが見つかりません')

      // 環境変数を復元
      process.env.NODE_ENV = originalEnv
    })
  })
})
