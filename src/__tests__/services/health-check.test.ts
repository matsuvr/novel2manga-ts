import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getHealthStatus } from '@/services/application/health-check'
import { getDatabaseService } from '@/services/db-factory'
import { StorageFactory } from '@/utils/storage'

vi.mock('@/services/db-factory', () => ({
  getDatabaseService: vi.fn(),
}))

vi.mock('@/utils/storage', () => ({
  StorageFactory: {
    getNovelStorage: vi.fn(),
  },
}))

describe('HealthCheckService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should aggregate component statuses correctly', async () => {
    const mockDb = { getNovel: vi.fn().mockResolvedValue(null) }
    vi.mocked(getDatabaseService).mockReturnValue(mockDb)
    vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    })

    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(0) // db start
    nowSpy.mockReturnValueOnce(0) // storage start
    nowSpy.mockReturnValueOnce(1) // db end
    nowSpy.mockReturnValueOnce(1) // storage end

    const result = await getHealthStatus()

    expect(result.status).toBe('ok')
    expect(result.components.database.status).toBe('ok')
    expect(result.components.storage.status).toBe('ok')

    nowSpy.mockRestore()
  })

  it('should measure latency accurately', async () => {
    const mockDb = { getNovel: vi.fn().mockResolvedValue(null) }
    vi.mocked(getDatabaseService).mockReturnValue(mockDb)
    vi.mocked(StorageFactory.getNovelStorage).mockResolvedValue({
      list: vi.fn().mockResolvedValue([]),
    })

    const nowSpy = vi.spyOn(performance, 'now')
    nowSpy.mockReturnValueOnce(0) // db start
    nowSpy.mockReturnValueOnce(0) // storage start
    nowSpy.mockReturnValueOnce(50) // db end
    nowSpy.mockReturnValueOnce(80) // storage end

    const result = await getHealthStatus()

    expect(result.components.database.latencyMs).toBe(50)
    expect(result.components.storage.latencyMs).toBe(80)

    nowSpy.mockRestore()
  })
})
