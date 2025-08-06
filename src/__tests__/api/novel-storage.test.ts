import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from '@/app/api/novel/storage/route'
import { StorageFactory } from '@/utils/storage'

// ストレージのモック
vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn(),
  },
}))

// UUIDモック
vi.mock('@/utils/uuid', () => ({
  generateUUID: vi.fn(() => 'test-storage-uuid'),
}))

describe('/api/novel/storage', () => {
  let mockNovelStorage: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // モックストレージの設定
    mockNovelStorage = {
      put: vi.fn(),
      get: vi.fn(),
    }

    vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue(mockNovelStorage)
  })

  afterEach(async () => {
    // テストデータのクリーンアップは統合テストで実施
  })

  describe('POST /api/novel/storage', () => {
    it('有効なテキストでストレージに保存する', async () => {
      const novelText = '昔々あるところに、おじいさんとおばあさんが住んでいました。'.repeat(5)
      const requestBody = {
        text: novelText,
      }

      const request = new NextRequest('http://localhost:3000/api/novel/storage', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('小説が正常にアップロードされました')
      expect(data.uuid).toBe('test-storage-uuid')
      expect(data.fileName).toBe('test-storage-uuid.json')
      expect(data.length).toBe(novelText.length)
      expect(data.preview).toBe(novelText.slice(0, 100))
    })

    it('textが未指定の場合は400エラーを返す', async () => {
      const requestBody = {}

      const request = new NextRequest('http://localhost:3000/api/novel/storage', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('テキストが必要です')
    })

    it('textが文字列でない場合は400エラーを返す', async () => {
      const requestBody = {
        text: ['配列', 'は', '無効'],
      }

      const request = new NextRequest('http://localhost:3000/api/novel/storage', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('テキストが必要です')
    })

    it('textが空文字列の場合は400エラーを返す', async () => {
      const requestBody = {
        text: '',
      }

      const request = new NextRequest('http://localhost:3000/api/novel/storage', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('テキストが必要です')
    })

    it('長いテキストでも正常に処理する', async () => {
      const novelText = '長い小説のテキストです。'.repeat(1000) // 約10KB
      const requestBody = {
        text: novelText,
      }

      const request = new NextRequest('http://localhost:3000/api/novel/storage', {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.message).toBe('小説が正常にアップロードされました')
      expect(data.length).toBe(novelText.length)
      expect(data.preview).toBe(novelText.slice(0, 100))
    })
  })

  describe('GET /api/novel/storage', () => {
    let testUuid: string

    beforeEach(async () => {
      // テスト用データを事前に設定
      testUuid = 'test-get-storage-uuid'
      const testData = {
        text: 'テスト用の小説テキストです。取得テスト用です。',
        metadata: {
          title: 'テスト小説',
          uploadedAt: new Date().toISOString(),
        },
      }

      // モックでデータを返すように設定
      mockNovelStorage.get.mockImplementation((path: string) => {
        if (path === `${testUuid}.json`) {
          return { text: JSON.stringify(testData) }
        }
        return null
      })
    })

    it('有効なUUIDで小説を取得する', async () => {
      const request = new NextRequest(`http://localhost:3000/api/novel/storage?uuid=${testUuid}`)

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.text).toBe('テスト用の小説テキストです。取得テスト用です。')
      expect(data.uuid).toBe(testUuid)
      expect(data.fileName).toBe(`${testUuid}.json`)
      expect(data.metadata).toBeDefined()
    })

    it('UUIDが未指定の場合は400エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/novel/storage')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('UUIDが必要です')
    })

    it('存在しないUUIDの場合は404エラーを返す', async () => {
      // 存在しないファイルのnullを返すようにモック設定
      mockNovelStorage.get.mockReturnValue(null)

      const request = new NextRequest(
        'http://localhost:3000/api/novel/storage?uuid=nonexistent-uuid',
      )

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('ファイルが見つかりません')
    })

    it('UUIDが空文字列の場合は400エラーを返す', async () => {
      const request = new NextRequest('http://localhost:3000/api/novel/storage?uuid=')

      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('UUIDが必要です')
    })
  })
})
