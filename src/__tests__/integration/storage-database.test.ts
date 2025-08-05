import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobProgress } from '@/types'
import { DatabaseService } from '../../services/database'
import { StorageFactory } from '../../utils/storage'

// モック設定
vi.mock('@/config', () => ({
  isDevelopment: vi.fn(() => true),
  getConfig: vi.fn(() => ({
    get: vi.fn((key: string) => {
      if (key === 'database') {
        return { path: '.test-storage/database.sqlite' }
      }
      return {}
    }),
  })),
}))

describe('Storage and Database Integration', () => {
  let databaseService: DatabaseService
  let testDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    // テスト用のディレクトリを作成
    testDir = path.join(process.cwd(), '.test-storage')
    await fs.mkdir(testDir, { recursive: true })

    // 既存のデータベースファイルを削除してクリーンな状態にする
    const dbPath = path.join(process.cwd(), '.test-storage', 'database.sqlite')
    try {
      await fs.unlink(dbPath)
    } catch (_error) {
      // ファイルが存在しない場合は無視
    }

    // データベースサービスのインスタンス化
    databaseService = new DatabaseService()
  })

  afterEach(async () => {
    // テストディレクトリのクリーンアップ
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (_error) {
      // エラーは無視
    }
  })

  describe('Novel Storage Integration', () => {
    it('should save and retrieve novel data', async () => {
      const novelStorage = await StorageFactory.getNovelStorage()
      const novelId = 'test-novel-123'
      const novelData = {
        text: 'これはテスト用の小説です。',
        metadata: {
          title: 'テスト小説',
          author: 'テスト著者',
          uploadedAt: new Date().toISOString(),
        },
      }

      // 保存
      await novelStorage.put(`${novelId}.json`, JSON.stringify(novelData))

      // 取得
      const retrieved = await novelStorage.get(`${novelId}.json`)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.text).toBeDefined()
      expect(JSON.parse(retrieved!.text)).toEqual(novelData)
    })
  })

  describe('Chunk Storage Integration', () => {
    it('should save and retrieve chunk data', async () => {
      const chunkStorage = await StorageFactory.getChunkStorage()
      const chunkId = 'chunk-456'
      const chunkData = {
        novelId: 'test-novel-123',
        chunkIndex: 0,
        text: 'これは最初のチャンクです。',
        startPosition: 0,
        endPosition: 100,
      }

      // 保存
      await chunkStorage.put(`${chunkId}.json`, JSON.stringify(chunkData))

      // 取得
      const retrieved = await chunkStorage.get(`${chunkId}.json`)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.text).toBeDefined()
      expect(JSON.parse(retrieved!.text)).toEqual(chunkData)
    })
  })

  describe('Analysis Storage Integration', () => {
    it('should save and retrieve analysis results', async () => {
      const analysisStorage = await StorageFactory.getAnalysisStorage()
      const jobId = 'job-789'
      const chunkIndex = 0
      const analysisData = {
        characters: [
          { id: 'char-1', name: '主人公', description: 'メインキャラクター', firstAppearance: 0 },
        ],
        scenes: [
          {
            id: 'scene-1',
            location: '学校',
            description: '教室のシーン',
            startIndex: 0,
            endIndex: 50,
          },
        ],
        dialogues: [{ id: 'dialog-1', speakerId: 'char-1', text: 'こんにちは', index: 10 }],
        highlights: [],
        situations: [],
      }

      // 保存
      const key = `${jobId}/chunk_${chunkIndex}.json`
      await analysisStorage.put(key, JSON.stringify(analysisData))

      // 取得
      const retrieved = await analysisStorage.get(key)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.text).toBeDefined()
      expect(JSON.parse(retrieved!.text)).toEqual(analysisData)
    })
  })

  describe('Database and Storage Combined Operations', () => {
    it('should create job and store related files', async () => {
      const novelId = 'novel-integrated-test'
      const jobId = 'job-integrated-test'
      const originalText = 'これは統合テスト用の小説テキストです。'

      // 1. Novel情報をストレージに保存
      const novelStorage = await StorageFactory.getNovelStorage()
      await novelStorage.put(`${novelId}/original.txt`, originalText)
      await novelStorage.put(
        `${novelId}/metadata.json`,
        JSON.stringify({
          uploadedAt: new Date().toISOString(),
        }),
      )

      // 2. データベースにNovel情報を保存
      const createdNovelId = await databaseService.createNovel({
        title: 'テスト小説',
        author: 'テスト作者',
        originalTextPath: `${novelId}/original.txt`,
        textLength: originalText.length,
        language: 'ja',
        metadataPath: `${novelId}/metadata.json`,
      })

      // 3. Jobを作成
      await databaseService.createJob(jobId, createdNovelId, 'テストジョブ')

      // 4. Job情報を取得
      const job = await databaseService.getJob(jobId)

      expect(job).not.toBeNull()
      expect(job?.id).toBe(jobId)
      expect(job?.novelId).toBe(createdNovelId)
      expect(job?.status).toBe('pending')
      expect(job?.currentStep).toBe('initialized')
    })

    it('should update job progress and status', async () => {
      const novelId = 'novel-progress-test'
      const jobId = 'job-progress-test'
      const originalText = 'プログレステスト用テキスト'

      // Novelを作成
      const createdNovelId = await databaseService.createNovel({
        title: 'プログレステスト小説',
        originalTextPath: `${novelId}/original.txt`,
        textLength: originalText.length,
        language: 'ja',
      })

      // ジョブを作成
      await databaseService.createJob(jobId, createdNovelId)

      // プログレスを更新
      const progress: JobProgress = {
        currentStep: 'analyze',
        processedChunks: 3,
        totalChunks: 5,
        episodes: [],
      }

      await databaseService.updateJobProgress(jobId, progress)
      await databaseService.updateJobStatus(jobId, 'processing')

      // 拡張ジョブ情報を取得
      const extendedJob = await databaseService.getJobWithProgress(jobId)

      expect(extendedJob).not.toBeNull()
      expect(extendedJob?.status).toBe('processing')
      expect(extendedJob?.processedChunks).toBe(3)
      expect(extendedJob?.currentStep).toBe('analyze')
    })

    it('should handle layout storage', async () => {
      const layoutStorage = await StorageFactory.getLayoutStorage()
      const jobId = 'job-layout-test'
      const episodeNumber = 1
      const layoutYaml = `
episode: 1
pages:
  - page: 1
    panels:
      - id: panel-1
        x: 0
        y: 0
        width: 100
        height: 100
        content:
          type: dialogue
          character: 主人公
          text: こんにちは
`

      // レイアウトを保存
      const key = `${jobId}/episode_${episodeNumber}.yaml`
      await layoutStorage.put(key, layoutYaml)

      // レイアウトを取得
      const retrieved = await layoutStorage.get(key)

      expect(retrieved).not.toBeNull()
      expect(retrieved?.text).toBe(layoutYaml)
    })
  })

  describe('Error Handling', () => {
    it('should handle non-existent files gracefully', async () => {
      const storage = await StorageFactory.getNovelStorage()
      const result = await storage.get('non-existent-file.json')

      expect(result).toBeNull()
    })

    it('should handle database errors gracefully', async () => {
      const job = await databaseService.getJob('non-existent-job-id')

      expect(job).toBeNull()
    })
  })
})
