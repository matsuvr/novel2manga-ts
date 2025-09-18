import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalFileStorage, StorageKeys } from '../utils/storage'
import { setupUnifiedTestEnvironment } from './__helpers/unified-test-setup'

// 統合テスト環境セットアップ
let testCleanup: () => void

beforeEach(() => {
  testCleanup = setupUnifiedTestEnvironment().cleanup
})

afterEach(() => {
  testCleanup()
})

describe('Storage', () => {
  describe('StorageKeys', () => {
    it('should generate correct storage keys', () => {
      expect(StorageKeys.novel('test-uuid')).toBe('test-uuid.json')
      const scope = { novelId: 'novel-1', jobId: 'job-1' }
      expect(StorageKeys.chunk({ ...scope, index: 3 })).toBe(
        'novel-1/jobs/job-1/chunks/chunk_3.txt',
      )
      expect(StorageKeys.chunkAnalysis({ ...scope, index: 0 })).toBe(
        'novel-1/jobs/job-1/analysis/chunk_0.json',
      )
      expect(StorageKeys.integratedAnalysis(scope)).toBe(
        'novel-1/jobs/job-1/analysis/integrated.json',
      )
      expect(StorageKeys.episodeBoundaries(scope)).toBe(
        'novel-1/jobs/job-1/analysis/episodes.json',
      )
      // レイアウトはJSONに統一
      expect(StorageKeys.episodeLayout({ ...scope, episodeNumber: 1 })).toBe(
        'novel-1/jobs/job-1/layouts/episode_1.json',
      )
      expect(
        StorageKeys.pageRender({ ...scope, episodeNumber: 1, pageNumber: 1 }),
      ).toBe('novel-1/jobs/job-1/renders/episode_1/page_1.png')
    })
  })

  describe('StorageFactory', () => {
    it('should return unified memory storage instances', async () => {
      // 統合テスト環境では常にメモリストレージを使用
      const { StorageFactory } = await import('@/utils/storage')

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

      // ストレージが実際に動作するかテスト
      await novelStorage.put('test-key', 'test-value')
      const result = await novelStorage.get('test-key')
      expect(result?.text).toBe('test-value')
    })

    it('provides a functional storage implementation under Vitest regardless of STORAGE_MODE', async () => {
      const { StorageFactory } = await import('@/utils/storage')
      const storage = await StorageFactory.getNovelStorage()
      await storage.put('sanity-check.txt', 'ok')
      const loaded = await storage.get('sanity-check.txt')
      expect(loaded?.text).toBe('ok')
    })
  })

  describe('LocalFileStorage', () => {
    it('should exclude internal metadata fields for binary files', async () => {
      // テスト用の一時ディレクトリを使用
      const baseDir = path.join(process.cwd(), '.test-storage', `local-file-storage-${Date.now()}`)
      const storage = new LocalFileStorage(baseDir)
      const key = 'binary/test.bin'
      const data = Buffer.from('hello world')
      const userMetadata = { foo: 'bar' }

      try {
        await storage.put(key, data, userMetadata)
        const result = await storage.get(key)

        expect(result).not.toBeNull()
        expect(result?.text).toBe(data.toString('base64'))
        expect(result?.metadata).toEqual(userMetadata)
        expect(result?.metadata).not.toHaveProperty('isBinary')
        expect(result?.metadata).not.toHaveProperty('createdAt')
      } finally {
        // テスト後のクリーンアップ（環境により rm が未実装のためフォールバック）
        try {
          const anyFs = fs as unknown as {
            rm?: (p: string, opts?: { recursive?: boolean; force?: boolean }) => Promise<void>
            rmdir?: (p: string, opts?: { recursive?: boolean }) => Promise<void>
          }
          if (typeof anyFs.rm === 'function') {
            await anyFs.rm(baseDir, { recursive: true, force: true })
          } else if (typeof anyFs.rmdir === 'function') {
            await anyFs.rmdir(baseDir, { recursive: true })
          }
        } catch (error) {
          console.warn('Failed to clean up test directory:', {
            baseDir,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    })
  })

  describe('Layout saving as plain text', () => {
    it('saves layout text and reads back unchanged (stored as .json)', async () => {
      const jobId = 'testjob123'
      const novelId = 'novel123'
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
      const key = await layoutPorts.putEpisodeLayout(novelId, jobId, episode, yamlText)

      // インメモリストレージから直接取得して検証
      const loaded = await layoutPorts.getEpisodeLayout(novelId, jobId, episode)
      expect(loaded).toBe(yamlText)

      // キーの形式も確認（JSONファイルとして保存）
      expect(key).toBe('novel123/jobs/testjob123/layouts/episode_1.json')
    })
  })
})
