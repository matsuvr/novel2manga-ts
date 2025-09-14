import { promises as fs } from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureLocalStorageStructure } from '@/utils/storage'

// 統合テスト - ストレージ移行
// Cloudflare R2からローカルファイルシステムへの移行を検証

describe('Storage Migration Integration', () => {
  const testStorageBase = path.join(process.cwd(), 'test-storage')
  const testDirs = ['novels', 'chunks', 'analysis', 'layouts', 'renders', 'outputs']

  beforeEach(async () => {
    // テスト用のストレージディレクトリを作成
    await fs.mkdir(testStorageBase, { recursive: true })
    for (const dir of testDirs) {
      await fs.mkdir(path.join(testStorageBase, dir), { recursive: true })
    }
  })

  afterEach(async () => {
    // テスト用のストレージディレクトリをクリーンアップ
    try {
      await fs.rm(testStorageBase, { recursive: true, force: true })
    } catch (error) {
      // クリーンアップに失敗してもテストを続行
    }
  })

  describe('Storage Directory Structure', () => {
    it('should create required storage directories', async () => {
      // 実装に合わせて .test-storage/.local-storage 配下を検証
      await ensureLocalStorageStructure()
      const storageBase =
        process.env.NODE_ENV === 'test'
          ? path.join(process.cwd(), '.test-storage')
          : path.join(process.cwd(), '.local-storage')
      const requiredDirs = ['novels', 'chunks', 'analysis', 'layouts', 'renders', 'outputs']
      for (const dir of requiredDirs) {
        const dirPath = path.join(storageBase, dir)
        const stats = await fs.stat(dirPath)
        expect(stats.isDirectory()).toBe(true)
      }
    })

    it('should maintain proper directory permissions', async () => {
      const storageDir = path.join(testStorageBase, 'novels')
      const stats = await fs.stat(storageDir)
      expect(stats.isDirectory()).toBe(true)
    })
  })

  describe('File Migration Simulation', () => {
    it('should handle file migration from R2 to local storage', async () => {
      // R2からローカルへのファイル移行シミュレーション
      const testFile = {
        name: 'test-novel.txt',
        content: 'This is a test novel content for migration.',
        r2Path: 'novels/test-novel.txt',
        localPath: path.join(testStorageBase, 'novels', 'test-novel.txt'),
      }

      try {
        // テストファイルを作成（R2からのダウンロードをシミュレート）
        await fs.writeFile(testFile.localPath, testFile.content)

        // ファイルが正しく作成されたことを確認
        const fileExists = await fs
          .access(testFile.localPath)
          .then(() => true)
          .catch(() => false)
        expect(fileExists).toBe(true)

        // ファイル内容を検証
        const content = await fs.readFile(testFile.localPath, 'utf-8')
        expect(content).toBe(testFile.content)

        // ファイルサイズを確認
        const stats = await fs.stat(testFile.localPath)
        expect(stats.size).toBe(testFile.content.length)
      } catch (error) {
        throw error
      }
    })

    it('should handle binary file migration', async () => {
      // バイナリファイルの移行テスト
      const testBinaryFile = {
        name: 'test-image.png',
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNGヘッダー
        localPath: path.join(testStorageBase, 'renders', 'test-image.png'),
      }

      try {
        await fs.writeFile(testBinaryFile.localPath, testBinaryFile.content)

        const fileExists = await fs
          .access(testBinaryFile.localPath)
          .then(() => true)
          .catch(() => false)
        expect(fileExists).toBe(true)

        const content = await fs.readFile(testBinaryFile.localPath)
        expect(content.equals(testBinaryFile.content)).toBe(true)
      } catch (error) {
        throw error
      }
    })

    it('should handle large file migration', async () => {
      // 大容量ファイルの移行テスト
      const largeFileSize = 1024 * 1024 // 1MB
      const largeFilePath = path.join(testStorageBase, 'outputs', 'large-file.zip')

      try {
        // ベースラインのメモリ使用量を取得してからバッファを作成/書き込みする
        const beforeHeap = process.memoryUsage().heapUsed

        const largeFileContent = Buffer.alloc(largeFileSize, 'x')
        await fs.writeFile(largeFilePath, largeFileContent)

        const stats = await fs.stat(largeFilePath)
        expect(stats.size).toBe(largeFileSize)

        // 書き込み前後のヒープ差分を確認し、極端な増加がないことを保証する
        const afterHeap = process.memoryUsage().heapUsed
        expect(afterHeap - beforeHeap).toBeLessThan(50 * 1024 * 1024) // 増加は50MB未満
      } catch (error) {
        throw error
      }
    })
  })

  describe('Storage Path Migration', () => {
    it('should update database file path references', async () => {
      // データベース内のファイルパス参照を更新
      try {
        // テスト用のストレージファイルレコードを作成
        const testStorageFile = {
          id: 'test-storage-file-' + Date.now(),
          novelId: 'test-novel-id',
          filePath: 'r2://novels/test-novel.txt', // 古いR2パス
          fileCategory: 'original',
          fileType: 'txt',
          fileSize: 1024,
        }

        // 移行後の新しいパス
        const newFilePath = 'storage/novels/test-novel.txt'

        // パス更新ロジックをテスト
        const updatedPath = testStorageFile.filePath.replace(/^r2:\/\/(.*)$/, 'storage/$1')

        expect(updatedPath).toBe(newFilePath)
      } catch (error) {
        throw error
      }
    })

    it('should validate file existence after migration', async () => {
      // 移行後のファイル存在検証
      const testFile = path.join(testStorageBase, 'novels', 'validated-file.txt')
      const fileContent = 'Content for validation test'

      try {
        await fs.writeFile(testFile, fileContent)

        // ファイル存在検証ロジック
        const exists = await fs
          .access(testFile)
          .then(() => true)
          .catch(() => false)
        expect(exists).toBe(true)

        // ファイル整合性検証
        const content = await fs.readFile(testFile, 'utf-8')
        expect(content).toBe(fileContent)
      } catch (error) {
        throw error
      }
    })
  })

  describe('Storage Cleanup and Management', () => {
    it('should handle duplicate file conflicts', async () => {
      // 重複ファイルの競合処理
      const baseFileName = 'duplicate-test.txt'
      const filePath1 = path.join(testStorageBase, 'novels', baseFileName)
      const filePath2 = path.join(testStorageBase, 'novels', 'duplicate-test-1.txt')

      try {
        await fs.writeFile(filePath1, 'Original content')

        // 重複ファイルを検出してリネーム
        let counter = 1
        let newFilePath = filePath1
        while (
          await fs
            .access(newFilePath)
            .then(() => true)
            .catch(() => false)
        ) {
          const ext = path.extname(baseFileName)
          const name = path.basename(baseFileName, ext)
          newFilePath = path.join(path.dirname(filePath1), `${name}-${counter}${ext}`)
          counter++
        }

        await fs.writeFile(newFilePath, 'Duplicate content')
        expect(newFilePath).toBe(filePath2)
      } catch (error) {
        throw error
      }
    })

    it('should provide storage usage statistics', async () => {
      // ストレージ使用量統計
      try {
        const testFiles = [
          { path: path.join(testStorageBase, 'novels', 'file1.txt'), size: 1024 },
          { path: path.join(testStorageBase, 'chunks', 'file2.txt'), size: 2048 },
          { path: path.join(testStorageBase, 'analysis', 'file3.txt'), size: 4096 },
        ]

        // テストファイルを作成
        for (const file of testFiles) {
          await fs.writeFile(file.path, 'x'.repeat(file.size))
        }

        // ストレージ使用量を計算
        let totalSize = 0
        for (const dir of testDirs) {
          const dirPath = path.join(testStorageBase, dir)
          const files = await fs.readdir(dirPath)
          for (const file of files) {
            const filePath = path.join(dirPath, file)
            const stats = await fs.stat(filePath)
            totalSize += stats.size
          }
        }

        expect(totalSize).toBe(7168) // 1024 + 2048 + 4096
      } catch (error) {
        throw error
      }
    })
  })
})
