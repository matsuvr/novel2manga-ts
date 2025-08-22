import { promises as fs } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isDevelopment } from '@/config'
import { clearStorageCache, LocalFileStorage, StorageFactory, StorageKeys } from '../utils/storage'

// モック設定
vi.mock('@/config', () => ({
  isDevelopment: vi.fn(),
  getDatabaseConfig: vi.fn(() => ({
    sqlite: {
      path: ':memory:',
    },
  })),
}))

const mockIsDevelopment = vi.mocked(isDevelopment)

describe('Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearStorageCache()
  })

  describe('StorageKeys', () => {
    it('should generate correct storage keys', () => {
      expect(StorageKeys.novel('test-uuid')).toBe('test-uuid.json')
      // chunk key signature changed to (jobId, index) and now stores .txt (without top-level dir prefix)
      expect(StorageKeys.chunk('job-1', 3)).toBe('job-1/chunk_3.txt')
      expect(StorageKeys.chunkAnalysis('job-1', 0)).toBe('job-1/chunk_0.json')
      expect(StorageKeys.integratedAnalysis('job-1')).toBe('job-1/integrated.json')
      expect(StorageKeys.narrativeAnalysis('job-1')).toBe('job-1/narrative.json')
      expect(StorageKeys.episodeLayout('job-1', 1)).toBe('job-1/episode_1.yaml')
      expect(StorageKeys.pageRender('job-1', 1, 1)).toBe('job-1/episode_1/page_1.png')
    })
  })

  describe('StorageFactory', () => {
    it('should throw error when storage is not configured in production', async () => {
      mockIsDevelopment.mockReturnValue(false)
      delete (globalThis as any).NOVEL_STORAGE
      delete (globalThis as any).CHUNKS_STORAGE
      delete (globalThis as any).ANALYSIS_STORAGE
      delete (globalThis as any).LAYOUTS_STORAGE
      delete (globalThis as any).RENDERS_STORAGE

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

    it('should return storage instances in development mode', async () => {
      mockIsDevelopment.mockReturnValue(true)

      // StorageFactoryは実際の実装を使うため、
      // 開発モードではLocalFileStorageのインスタンスが返されることだけを確認
      const novelStorage = await StorageFactory.getNovelStorage()
      const chunkStorage = await StorageFactory.getChunkStorage()
      const analysisStorage = await StorageFactory.getAnalysisStorage()
      const layoutStorage = await StorageFactory.getLayoutStorage()
      const renderStorage = await StorageFactory.getRenderStorage()

      expect(novelStorage).toBeDefined()
      expect(chunkStorage).toBeDefined()
      expect(analysisStorage).toBeDefined()
      expect(layoutStorage).toBeDefined()
      expect(renderStorage).toBeDefined()
    })

    it('should return storage instances in production mode with bindings', async () => {
      mockIsDevelopment.mockReturnValue(false)

      // R2バインディングのモック
      ;(globalThis as any).NOVEL_STORAGE = {
        put: vi.fn(),
        get: vi.fn(),
        delete: vi.fn(),
        head: vi.fn(),
      }

      const novelStorage = await StorageFactory.getNovelStorage()

      expect(novelStorage).toBeDefined()

      // クリーンアップ
      delete (globalThis as any).NOVEL_STORAGE
    })
  })

  describe('LocalFileStorage', () => {
    const baseDir = path.join(process.cwd(), '.test-storage', 'local-file-storage')

    beforeEach(async () => {
      await fs.rm(baseDir, { recursive: true, force: true })
    })

    it('should exclude internal metadata fields for binary files', async () => {
      const storage = new LocalFileStorage(baseDir)
      const key = 'binary/test.bin'
      const data = Buffer.from('hello world')
      const userMetadata = { foo: 'bar' }

      await storage.put(key, data, userMetadata)

      const result = await storage.get(key)

      expect(result).not.toBeNull()
      expect(result?.text).toBe(data.toString('base64'))
      expect(result?.metadata).toEqual(userMetadata)
      expect(result?.metadata).not.toHaveProperty('isBinary')
      expect(result?.metadata).not.toHaveProperty('createdAt')
    })

    afterAll(async () => {
      await fs.rm(baseDir, { recursive: true, force: true })
    })
  })

  describe('YAML layout saving', () => {
    const layoutsBase = path.join(process.cwd(), '.test-storage', 'layouts')

    beforeEach(async () => {
      await fs.rm(layoutsBase, { recursive: true, force: true })
      mockIsDevelopment.mockReturnValue(true)
    })

    it('saves .yaml as plain text and reads back unchanged', async () => {
      const jobId = 'testjob123'
      const episode = 1
      const yamlText = [
        'title: テストエピソード',
        "created_at: '2025-08-16'",
        'episodeNumber: 1',
        'pages:',
        '  - page_number: 1',
        '    panels:',
        '      - id: 1',
        '        content: はじめてのページ',
      ].join('\n')

      const { getStoragePorts } = await import('@/infrastructure/storage/ports')
      const layoutPorts = getStoragePorts().layout
      const key = await layoutPorts.putEpisodeLayout(jobId, episode, yamlText)

      // Verify file content is exactly the YAML, not JSON-wrapped
      const filePath = path.join(layoutsBase, key)
      const saved = await fs.readFile(filePath, 'utf-8')
      expect(saved.startsWith('{')).toBe(false)
      expect(saved).toBe(yamlText)

      // And StoragePorts.get returns the same YAML
      const loaded = await layoutPorts.getEpisodeLayout(jobId, episode)
      expect(loaded).toBe(yamlText)
    })

    afterAll(async () => {
      await fs.rm(layoutsBase, { recursive: true, force: true })
    })
  })
})
