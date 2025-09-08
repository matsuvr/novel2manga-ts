/**
 * TransactionManager テスト
 * ストレージとデータベース操作の強整合性を検証
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Storage } from '@/utils/storage'
import { MockDatabase, setupUnifiedTestEnvironment } from '../__helpers/unified-test-setup'

// グローバルモックインスタンス
let mockDatabaseInstance: MockDatabase
let mockRecordStorageFile: any

// モックは後でセットアップ

// 統合テスト環境セットアップ
let testCleanup: () => void
let TransactionManager: any
let executeStorageDbTransaction: any
let executeStorageWithDbOperation: any
let executeStorageWithTracking: any

beforeEach(async () => {
  const { cleanup, mockDb } = setupUnifiedTestEnvironment()
  testCleanup = cleanup
  mockDatabaseInstance = mockDb

  // Get the mocked recordStorageFile function from the unified setup
  const storageTrackerModule = await import('@/services/application/storage-tracker')
  mockRecordStorageFile = storageTrackerModule.recordStorageFile as any

  // Clear vi module cache to force re-import
  vi.resetModules()

  // Factory依存を最小モック（getRawDatabase のみ）
  vi.mock('@/services/database', () => ({
    getDatabaseServiceFactory: () => ({
      getRawDatabase: () => mockDatabaseInstance,
    }),
  }))

  // モック適用後にTransactionManagerをインポート
  const transactionManagerModule = await import('@/services/application/transaction-manager')
  TransactionManager = transactionManagerModule.TransactionManager
  executeStorageDbTransaction = transactionManagerModule.executeStorageDbTransaction
  executeStorageWithDbOperation = transactionManagerModule.executeStorageWithDbOperation
  executeStorageWithTracking = transactionManagerModule.executeStorageWithTracking

  // モックをリセット
  if (mockRecordStorageFile && mockRecordStorageFile.mockClear) {
    mockRecordStorageFile.mockClear()
    mockRecordStorageFile.mockResolvedValue(undefined)
  }
})

afterEach(() => {
  testCleanup()
})

// テストヘルパー: インメモリストレージ
class TestStorage implements Storage {
  private data = new Map<string, { value: string | Buffer; metadata?: Record<string, string> }>()
  private failures = new Set<string>()

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    if (this.failures.has(key)) {
      throw new Error(`Test storage failure for key: ${key}`)
    }
    this.data.set(key, { value, metadata })
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const item = this.data.get(key)
    if (!item) return null
    return {
      text: item.value.toString(),
      metadata: item.metadata,
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    return this.data.has(key)
  }

  async head(key: string): Promise<{ size?: number; metadata?: Record<string, string> } | null> {
    const item = this.data.get(key)
    if (!item) return null
    return {
      size: Buffer.isBuffer(item.value) ? item.value.length : Buffer.byteLength(item.value),
      metadata: item.metadata,
    }
  }

  // テスト用メソッド
  setFailure(key: string): void {
    this.failures.add(key)
  }

  clearFailures(): void {
    this.failures.clear()
  }

  clear(): void {
    this.data.clear()
    this.failures.clear()
  }

  has(key: string): boolean {
    return this.data.has(key)
  }

  size(): number {
    return this.data.size
  }
}

// モックは統合環境でセットアップ済み

describe('TransactionManager', () => {
  let storage: TestStorage

  beforeEach(async () => {
    storage = new TestStorage()
  })

  describe('正常ケース', () => {
    it('ストレージ書き込み + DB操作 + 追跡が順序通り実行される', async () => {
      const tx = new TransactionManager()
      const dbOperationMock = vi.fn()

      tx.addStorageWrite(storage, 'test-key', 'test-value')
      tx.addDatabaseOperation(dbOperationMock)
      tx.addStorageTracking({
        filePath: 'test-key',
        fileCategory: 'chunk',
        fileType: 'txt',
        jobId: 'test-job',
      })

      await tx.execute()

      // 順序確認
      expect(storage.has('test-key')).toBe(true)
      expect(dbOperationMock).toHaveBeenCalled()
      expect(mockRecordStorageFile).toHaveBeenCalled()
      expect(tx.isCommitted()).toBe(true)
    })

    it('executeStorageDbTransaction 便利関数が正常に動作する', async () => {
      const dbResult = 'db-operation-result'
      const dbOperationMock = vi.fn().mockResolvedValue(dbResult)

      const result = await executeStorageDbTransaction({
        storage,
        key: 'test-key-2',
        value: 'test-value-2',
        metadata: { contentType: 'text/plain' },
        dbOperation: dbOperationMock,
        tracking: {
          filePath: 'test-key-2',
          fileCategory: 'analysis',
          fileType: 'json',
          jobId: 'test-job-2',
        },
      })

      expect(result).toBe(dbResult)
      expect(storage.has('test-key-2')).toBe(true)
      expect(dbOperationMock).toHaveBeenCalled()
      expect(mockRecordStorageFile).toHaveBeenCalled()
    })

    it('executeStorageWithTracking 軽量版が正常に動作する', async () => {
      await executeStorageWithTracking({
        storage,
        key: 'lightweight-key',
        value: 'lightweight-value',
        metadata: { contentType: 'text/plain' },
        tracking: {
          filePath: 'lightweight-key',
          fileCategory: 'chunk',
          fileType: 'txt',
          jobId: 'lightweight-job',
        },
      })

      expect(storage.has('lightweight-key')).toBe(true)
      expect(mockRecordStorageFile).toHaveBeenCalled()
    })

    it('executeStorageWithTracking で追跡失敗時もストレージ操作は成功する', async () => {
      mockRecordStorageFile.mockRejectedValueOnce(new Error('Tracking failed'))

      await executeStorageWithTracking({
        storage,
        key: 'tracking-fail-key',
        value: 'tracking-fail-value',
        tracking: {
          filePath: 'tracking-fail-key',
          fileCategory: 'chunk',
          fileType: 'txt',
          jobId: 'tracking-fail-job',
        },
      })

      // ストレージ操作は成功
      expect(storage.has('tracking-fail-key')).toBe(true)
      // 追跡は試行されるが失敗
      expect(mockRecordStorageFile).toHaveBeenCalled()
    })

    it('executeStorageWithDbOperation でストレージ+DB操作+追跡が統合実行される', async () => {
      const dbOperationMock = vi.fn()

      await executeStorageWithDbOperation({
        storage,
        key: 'integrated-key',
        value: 'integrated-value',
        metadata: { contentType: 'application/json' },
        dbOperation: dbOperationMock,
        tracking: {
          filePath: 'integrated-key',
          fileCategory: 'original',
          fileType: 'json',
          novelId: 'test-novel',
        },
      })

      expect(storage.has('integrated-key')).toBe(true)
      expect(dbOperationMock).toHaveBeenCalled()
      expect(mockRecordStorageFile).toHaveBeenCalled()
    })

    it('executeStorageWithDbOperation でDB操作なしでも動作する', async () => {
      await executeStorageWithDbOperation({
        storage,
        key: 'no-db-key',
        value: 'no-db-value',
        // dbOperation なし
        tracking: {
          filePath: 'no-db-key',
          fileCategory: 'chunk',
          fileType: 'txt',
          jobId: 'no-db-job',
        },
      })

      expect(storage.has('no-db-key')).toBe(true)
      expect(mockRecordStorageFile).toHaveBeenCalled()
    })

    it('削除操作が最後に実行される', async () => {
      const tx = new TransactionManager()

      // 先に削除対象データを作成
      await storage.put('delete-key', 'to-be-deleted')
      expect(storage.has('delete-key')).toBe(true)

      tx.addStorageWrite(storage, 'new-key', 'new-value')
      tx.addStorageDelete(storage, 'delete-key')

      await tx.execute()

      expect(storage.has('new-key')).toBe(true)
      expect(storage.has('delete-key')).toBe(false)
    })
  })

  describe('エラーケースとロールバック', () => {
    it('ストレージ書き込み失敗時はすぐにエラーが発生する', async () => {
      const tx = new TransactionManager()
      storage.setFailure('fail-key')

      tx.addStorageWrite(storage, 'fail-key', 'test-value')

      await expect(tx.execute()).rejects.toThrow('Test storage failure for key: fail-key')
      expect(storage.size()).toBe(0)
    })

    it('DB操作失敗時はストレージをロールバックする', async () => {
      const tx = new TransactionManager()
      const dbOperationMock = vi.fn().mockRejectedValue(new Error('DB operation failed'))

      tx.addStorageWrite(storage, 'test-key', 'test-value')
      tx.addDatabaseOperation(dbOperationMock)

      await expect(tx.execute()).rejects.toThrow('DB operation failed')

      // ストレージがロールバックされている（削除されている）
      expect(storage.has('test-key')).toBe(false)
      expect(tx.isCommitted()).toBe(false)
    })

    it('追跡失敗時はトランザクション全体をロールバックする', async () => {
      const tx = new TransactionManager()
      mockRecordStorageFile.mockRejectedValueOnce(new Error('Tracking failed'))

      tx.addStorageWrite(storage, 'test-key', 'test-value')
      tx.addDatabaseOperation(async () => {
        // 正常なDB操作
      })
      tx.addStorageTracking({
        filePath: 'test-key',
        fileCategory: 'chunk',
        fileType: 'txt',
        jobId: 'test-job',
      })

      await expect(tx.execute()).rejects.toThrow('Tracking failed')

      // 全てがロールバックされている
      expect(storage.has('test-key')).toBe(false)
      expect(tx.isCommitted()).toBe(false)
    })

    it('複数のストレージ操作があるときの部分ロールバック', async () => {
      const tx = new TransactionManager()

      tx.addStorageWrite(storage, 'key1', 'value1')
      tx.addStorageWrite(storage, 'key2', 'value2')
      tx.addDatabaseOperation(async () => {
        throw new Error('DB operation failed')
      })

      await expect(tx.execute()).rejects.toThrow('DB operation failed')

      // 全ストレージ操作がロールバックされている
      expect(storage.has('key1')).toBe(false)
      expect(storage.has('key2')).toBe(false)
    })
  })

  describe('状態管理', () => {
    it('実行後は新しい操作を追加できない', async () => {
      const tx = new TransactionManager()
      tx.addStorageWrite(storage, 'test-key', 'test-value')

      await tx.execute()

      expect(() => {
        tx.addStorageWrite(storage, 'new-key', 'new-value')
      }).toThrow('Cannot add operations after execution started')
    })

    it('同じトランザクションを二回実行できない', async () => {
      const tx = new TransactionManager()
      tx.addStorageWrite(storage, 'test-key', 'test-value')

      await tx.execute()

      await expect(tx.execute()).rejects.toThrow('Transaction already executed')
    })

    it('reset() でトランザクション状態をリセットできる', async () => {
      const tx = new TransactionManager()
      tx.addStorageWrite(storage, 'test-key', 'test-value')

      await tx.execute()
      expect(tx.isCommitted()).toBe(true)

      tx.reset()
      expect(tx.isCommitted()).toBe(false)

      // 新しい操作を追加できる
      tx.addStorageWrite(storage, 'new-key', 'new-value')
      await tx.execute()
      expect(storage.has('new-key')).toBe(true)
    })
  })
})
