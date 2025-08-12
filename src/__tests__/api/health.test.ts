import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/health/route'
import { DatabaseService } from '@/services/database'
import { __resetDatabaseServiceForTest } from '@/services/db-factory'

vi.mock('@/services/database', () => ({
  DatabaseService: vi.fn().mockImplementation(() => ({
    getNovel: vi.fn().mockResolvedValue(null),
  })),
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn().mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    }),
  },
}))

describe('/api/health', () => {
  let mockDb: any

  beforeEach(() => {
    __resetDatabaseServiceForTest()
    vi.clearAllMocks()
    mockDb = { getNovel: vi.fn().mockResolvedValue(null) }
    vi.mocked(DatabaseService).mockReturnValue(mockDb)
  })

  afterEach(() => {
    __resetDatabaseServiceForTest()
  })

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
    mockDb.getNovel.mockRejectedValueOnce(new Error('DB down'))
    const req = new NextRequest('http://localhost:3000/api/health')
    const res = await GET(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data.status).toBe('error')
    expect(data.components.database.status).toBe('error')
    expect(data.components.database.error).toContain('DB down')
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
  })
})
