import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'
import { db } from '@/services/database/index'

// モック用のヘルパー関数を定義（vi.mock より前に宣言）
let mockNovelsService: any

vi.mock('@/services/database/index', () => {
  // モック用のデータベースサービスを定義（ファクトリ内で初期化）
  const mockNovelsService = {
    getNovel: vi.fn().mockResolvedValue(null),
  }

  return {
    db: {
      novels: () => mockNovelsService,
    },
  }
})

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    }),
  },
}))

describe('/api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // モックをリセット
    vi.mocked(db).novels().getNovel.mockResolvedValue(null)
  })

  afterEach(() => {})

  it('正常系: 200 と ok ステータスを返す', async () => {
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.status).toBe('ok')
    expect(data.components.database.status).toBe('ok')
    expect(data.components.storage.status).toBe('ok')
    expect(typeof data.components.database.latencyMs).toBe('number')
    expect(typeof data.components.storage.latencyMs).toBe('number')
  })

  it('DB エラー時は503 と error ステータスを返す', async () => {
    vi.mocked(db).novels().getNovel.mockRejectedValueOnce(new Error('DB down'))
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.status).toBe('error')
    expect(data.components.database.status).toBe('error')
    expect(data.components.database.error).toContain('DB down')
    expect(data.components.database.context.operation).toBe('database_health_check')
  })

  it('Storage エラー時は503 と error ステータスを返す', async () => {
    const { StorageFactory } = await import('@/utils/storage')
    vi.mocked(StorageFactory.getNovelStorage).mockRejectedValueOnce(new Error('Storage down'))
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.status).toBe('error')
    expect(data.components.storage.status).toBe('error')
    expect(data.components.storage.error).toContain('Storage down')
    expect(data.components.storage.context.operation).toBe('storage_health_check')
  })
})
