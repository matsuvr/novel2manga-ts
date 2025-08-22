import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDevelopment } from '@/config'
import { auditStorageKeysOnStorages, clearStorageCache, LocalFileStorage } from '../utils/storage'

vi.mock('@/config', () => ({ isDevelopment: vi.fn() }))

describe('storage audit', () => {
  beforeEach(() => {
    vi.mocked(isDevelopment).mockReturnValue(true)
  })

  it('detects invalid format keys', async () => {
    // 共有ディレクトリ(.test-storage/novels)を直接削除すると他テストと競合するため、
    // このテスト専用の一時ディレクトリを使用し、StorageFactory.getNovelStorage を差し替える。
    clearStorageCache()
    const basePath = path.join(process.cwd(), '.test-storage', `novels-audit-${Date.now()}`)
    const storage = new LocalFileStorage(basePath)

    // 直下にテスト用ファイルを作成（prefix は指定しない）
    await storage.put('valid-1.json', '{}')
    await storage.put('.DS_Store', '{}')

    const result = await auditStorageKeysOnStorages([storage])

    // 後始末: スパイ解除（ディレクトリ削除は競合回避のためスキップ）
    // no-op

    expect(result.scanned).toBeGreaterThanOrEqual(2)
    expect(result.issues.some((i) => i.key.includes('.DS_Store'))).toBe(true)
  })
})
