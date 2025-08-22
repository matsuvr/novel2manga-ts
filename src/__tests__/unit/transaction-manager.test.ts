/**
 * TransactionManager テスト
 * ストレージとデータベース操作の強整合性を検証
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  executeStorageDbTransaction,
  executeStorageWithDbOperation,
  executeStorageWithTracking,
  TransactionManager,
} from '@/services/application/transaction-manager'
import type { Storage } from '@/utils/storage'

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

// データベースモック
vi.mock('@/db', () => ({
  getDatabase: vi.fn(() => ({
    $client: {
      exec: vi.fn(),
    },
  })),
}))

// ストレージ追跡モック
vi.mock('@/services/application/storage-tracker', () => ({
  recordStorageFile: vi.fn(),
}))

describe('TransactionManager', () => {
  let storage: TestStorage
  let dbMock: { exec: any }
  let recordStorageFileMock: any

  beforeEach(async () => {
    storage = new TestStorage()

    const { getDatabase } = await import('@/db')
    dbMock = {
      exec: vi.fn(),
    }
    vi.mocked(getDatabase).mockReturnValue({
      $client: dbMock,
    } as any)

    const { recordStorageFile } = await import('@/services/application/storage-tracker')
    recordStorageFileMock = vi.mocked(recordStorageFile)
    recordStorageFileMock.mockClear()
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
      expect(dbMock.exec).toHaveBeenCalledWith('BEGIN IMMEDIATE')
      expect(dbOperationMock).toHaveBeenCalled()
      expect(recordStorageFileMock).toHaveBeenCalled()
      expect(dbMock.exec).toHaveBeenCalledWith('COMMIT')
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
      expect(recordStorageFileMock).toHaveBeenCalled()
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
      expect(recordStorageFileMock).toHaveBeenCalled()
      // DB操作は呼ばれない
      expect(dbMock.exec).not.toHaveBeenCalled()
    })

    it('executeStorageWithTracking で追跡失敗時もストレージ操作は成功する', async () => {
      recordStorageFileMock.mockRejectedValueOnce(new Error('Tracking failed'))

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
      expect(recordStorageFileMock).toHaveBeenCalled()
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
      expect(recordStorageFileMock).toHaveBeenCalled()
      expect(dbMock.exec).toHaveBeenCalledWith('BEGIN IMMEDIATE')
      expect(dbMock.exec).toHaveBeenCalledWith('COMMIT')
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
      expect(recordStorageFileMock).toHaveBeenCalled()
      // DB操作は実行されない
      expect(dbMock.exec).not.toHaveBeenCalled()
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
      expect(dbMock.exec).not.toHaveBeenCalled()
    })

    it('DB操作失敗時はストレージをロールバックする', async () => {
      const tx = new TransactionManager()
      const dbOperationMock = vi.fn().mockRejectedValue(new Error('DB operation failed'))

      tx.addStorageWrite(storage, 'test-key', 'test-value')
      tx.addDatabaseOperation(dbOperationMock)

      await expect(tx.execute()).rejects.toThrow('DB operation failed')

      // ストレージがロールバックされている（削除されている）
      expect(storage.has('test-key')).toBe(false)
      expect(dbMock.exec).toHaveBeenCalledWith('BEGIN IMMEDIATE')
      expect(dbMock.exec).toHaveBeenCalledWith('ROLLBACK')
      expect(tx.isCommitted()).toBe(false)
    })

    it('追跡失敗時はトランザクション全体をロールバックする', async () => {
      const tx = new TransactionManager()
      recordStorageFileMock.mockRejectedValueOnce(new Error('Tracking failed'))

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
      expect(dbMock.exec).toHaveBeenCalledWith('ROLLBACK')
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
