import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDevelopment } from '@/config'
import { StorageFactory, StorageKeys } from '../utils/storage'

// モック設定
vi.mock('@/config', () => ({
  isDevelopment: vi.fn(),
}))

describe('Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('StorageKeys', () => {
    it('should generate correct storage keys', () => {
      expect(StorageKeys.novel('test-uuid')).toBe('novels/test-uuid.json')
      expect(StorageKeys.chunk('chunk-123')).toBe('chunks/chunk-123.json')
      expect(StorageKeys.chunkAnalysis('job-1', 0)).toBe('analyses/job-1/chunk_0.json')
      expect(StorageKeys.integratedAnalysis('job-1')).toBe('analyses/job-1/integrated.json')
      expect(StorageKeys.narrativeAnalysis('job-1')).toBe('analyses/job-1/narrative.json')
      expect(StorageKeys.episodeLayout('job-1', 1)).toBe('layouts/job-1/episode_1.yaml')
      expect(StorageKeys.pageRender('job-1', 1, 1)).toBe('renders/job-1/episode_1/page_1.png')
    })
  })

  describe('StorageFactory', () => {
    it('should throw error when storage is not configured in production', async () => {
      vi.mocked(isDevelopment).mockReturnValue(false)
      delete globalThis.NOVEL_STORAGE

      await expect(StorageFactory.getNovelStorage()).rejects.toThrow('Novel storage not configured')
      await expect(StorageFactory.getChunkStorage()).rejects.toThrow('Chunk storage not configured')
      await expect(StorageFactory.getAnalysisStorage()).rejects.toThrow(
        'Analysis storage not configured',
      )
      await expect(StorageFactory.getLayoutStorage()).rejects.toThrow(
        'Layout storage not configured',
      )
      await expect(StorageFactory.getRenderStorage()).rejects.toThrow(
        'Render storage not configured',
      )
    })

    it('should throw error when database is not configured in production', async () => {
      vi.mocked(isDevelopment).mockReturnValue(false)
      delete globalThis.DB

      await expect(StorageFactory.getDatabase()).rejects.toThrow('Database not configured')
    })

    it('should return storage instances in development mode', async () => {
      vi.mocked(isDevelopment).mockReturnValue(true)

      // StorageFactoryは実際の実装を使うため、
      // 開発モードではLocalFileStorageのインスタンスが返されることだけを確認
      const novelStorage = await StorageFactory.getNovelStorage()
      const chunkStorage = await StorageFactory.getChunkStorage()
      const analysisStorage = await StorageFactory.getAnalysisStorage()
      const layoutStorage = await StorageFactory.getLayoutStorage()
      const renderStorage = await StorageFactory.getRenderStorage()
      const database = await StorageFactory.getDatabase()

      expect(novelStorage).toBeDefined()
      expect(chunkStorage).toBeDefined()
      expect(analysisStorage).toBeDefined()
      expect(layoutStorage).toBeDefined()
      expect(renderStorage).toBeDefined()
      expect(database).toBeDefined()

      // データベースのクリーンアップ
      await database.close()
    })

    it('should return storage instances in production mode with bindings', async () => {
      vi.mocked(isDevelopment).mockReturnValue(false)

      // R2バインディングのモック
      globalThis.NOVEL_STORAGE = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
      }

      // D1バインディングのモック
      globalThis.DB = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn(),
            first: vi.fn(),
            all: vi.fn(() => ({ results: [] })),
          })),
        })),
        batch: vi.fn(),
      }

      const novelStorage = await StorageFactory.getNovelStorage()
      const database = await StorageFactory.getDatabase()

      expect(novelStorage).toBeDefined()
      expect(database).toBeDefined()

      // クリーンアップ
      delete globalThis.NOVEL_STORAGE
      delete globalThis.DB
    })
  })
})
