import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/jobs/[jobId]/episodes/route'
import { DatabaseService } from '@/services/database'
import { StorageFactory } from '@/utils/storage'

describe('/api/jobs/[jobId]/episodes', () => {
  let dbService: DatabaseService

  beforeEach(async () => {
    const db = await StorageFactory.getDatabase()
    dbService = new DatabaseService(db)
  })

  afterEach(async () => {
    // テスト用データのクリーンアップは省略（統合テストで実施）
  })

  describe('GET /api/jobs/[jobId]/episodes', () => {
    it('存在しないジョブIDの場合は404を返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/jobs/nonexistent/episodes')
      const params = { jobId: 'nonexistent' }

      const response = await GET(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Job not found')
    })
  })

  describe('POST /api/jobs/[jobId]/episodes', () => {
    it('有効なリクエストでエピソード分析を開始する', async () => {
      // まず、テスト用のnovelとjobを作成
      const novelId = await dbService.createNovel({
        title: 'テスト小説',
        originalTextPath: 'test-novel.txt',
        textLength: 1000,
        language: 'ja',
      })

      const jobId = 'test-job-episodes'
      await dbService.createJob(jobId, novelId, 'テストジョブ')

      const requestBody = {
        config: {
          targetCharsPerEpisode: 5000,
          minCharsPerEpisode: 3000,
          maxCharsPerEpisode: 8000,
        },
      }

      const request = new NextRequest('http://localhost:3000/api/jobs/test-job-episodes/episodes', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: jobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('Episode analysis started')
      expect(data.jobId).toBe(jobId)
      expect(data.status).toBe('processing')
    })

    it('存在しないジョブIDの場合は404を返す', async () => {
      const requestBody = { config: {} }

      const request = new NextRequest('http://localhost:3000/api/jobs/nonexistent/episodes', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })
      const params = { jobId: 'nonexistent' }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Job not found')
    })

    it('無効なリクエストボディの場合は400を返す', async () => {
      // まず、テスト用のnovelとjobを作成
      const novelId = await dbService.createNovel({
        title: 'テスト小説',
        originalTextPath: 'test-novel.txt',
        textLength: 1000,
        language: 'ja',
      })

      const jobId = 'test-job-episodes-invalid'
      await dbService.createJob(jobId, novelId, 'テストジョブ')

      const invalidRequestBody = {
        config: {
          targetCharsPerEpisode: 'invalid', // 文字列は無効
        },
      }

      const request = new NextRequest(
        'http://localhost:3000/api/jobs/test-job-episodes-invalid/episodes',
        {
          method: 'POST',
          body: JSON.stringify(invalidRequestBody),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )
      const params = { jobId: jobId }

      const response = await POST(request, { params })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
      expect(data.details).toBeDefined()
    })
  })
})
