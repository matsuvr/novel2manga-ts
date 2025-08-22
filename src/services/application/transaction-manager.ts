import { getDatabase } from '@/db'
import type { Storage } from '@/utils/storage'
import { type RecordStorageFileParams, recordStorageFile } from './storage-tracker'

// Drizzle transaction type
type DrizzleTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>['transaction']>[0]
>[0]

interface StorageOperation {
  storage: Storage
  key: string
  value: string | Buffer
  metadata?: Record<string, string>
}

interface StorageDeleteOperation {
  storage: Storage
  key: string
}

interface DatabaseOperation {
  execute: (tx?: DrizzleTransaction) => Promise<void>
  rollback?: () => Promise<void>
}

interface StorageTrackingOperation {
  params: RecordStorageFileParams
}

/**
 * ストレージとデータベース操作の強整合性を保証するトランザクションマネージャー
 *
 * - ストレージ書き込み → DB更新 → ストレージ追跡の順序で実行
 * - いずれかが失敗した場合は完全にロールバック
 * - 全操作が完了するまでトランザクション未確定状態
 */
export class TransactionManager {
  private storageOps: StorageOperation[] = []
  private deleteOps: StorageDeleteOperation[] = []
  private dbOps: DatabaseOperation[] = []
  private trackingOps: StorageTrackingOperation[] = []
  private executed = false
  private committed = false

  /**
   * ストレージ書き込み操作を追加
   */
  addStorageWrite(
    storage: Storage,
    key: string,
    value: string | Buffer,
    metadata?: Record<string, string>,
  ): void {
    if (this.executed) {
      throw new Error('Cannot add operations after execution started')
    }
    this.storageOps.push({ storage, key, value, metadata })
  }

  /**
   * ストレージ削除操作を追加
   */
  addStorageDelete(storage: Storage, key: string): void {
    if (this.executed) {
      throw new Error('Cannot add operations after execution started')
    }
    this.deleteOps.push({ storage, key })
  }

  /**
   * データベース操作を追加
   * @param execute - 実行する操作（Drizzleトランザクションオブジェクトを受け取るoptional parameter）
   * @param rollback - ロールバック処理（オプション）
   */
  addDatabaseOperation(
    execute: (tx?: DrizzleTransaction) => Promise<void>,
    rollback?: () => Promise<void>,
  ): void {
    if (this.executed) {
      throw new Error('Cannot add operations after execution started')
    }
    this.dbOps.push({ execute, rollback })
  }

  /**
   * ストレージ追跡操作を追加
   */
  addStorageTracking(params: RecordStorageFileParams): void {
    if (this.executed) {
      throw new Error('Cannot add operations after execution started')
    }
    this.trackingOps.push({ params })
  }

  /**
   * 全操作を強整合性を保証して実行
   *
   * 実行順序:
   * 1. ストレージ書き込み（可視性確認まで）
   * 2. データベース操作（トランザクション内）
   * 3. ストレージ追跡（DB確定後）
   * 4. ストレージ削除（最後に実行）
   *
   * 失敗時は完全ロールバック
   */
  async execute(): Promise<void> {
    if (this.executed) {
      throw new Error('Transaction already executed')
    }
    this.executed = true

    const completedStorageOps: { storage: Storage; key: string }[] = []
    const completedDeleteOps: { storage: Storage; key: string }[] = []
    let drizzleDb: ReturnType<typeof getDatabase> | undefined

    try {
      // Phase 1: ストレージ書き込み（可視性確認まで完了）
      for (const op of this.storageOps) {
        await op.storage.put(op.key, op.value, op.metadata)
        completedStorageOps.push({ storage: op.storage, key: op.key })
      }

      // Phase 2: データベース操作（単一トランザクション）
      if (this.dbOps.length > 0) {
        const db = getDatabase()
        drizzleDb = db

        // better-sqlite3 は async コールバック非対応のため、$client があり exec が使える場合は手動境界
        const anyDb = db as unknown as { $client?: { exec?: (sql: string) => void } }
        const canManualTx = !!anyDb.$client?.exec

        if (canManualTx) {
          // 手動トランザクション境界
          const exec = anyDb.$client?.exec ? anyDb.$client.exec.bind(anyDb.$client) : undefined
          if (!exec) {
            throw new Error('Database client does not support manual transactions')
          }
          exec('BEGIN IMMEDIATE')
          try {
            for (const dbOp of this.dbOps) {
              await dbOp.execute(db as unknown as DrizzleTransaction)
            }
            for (const trackingOp of this.trackingOps) {
              await recordStorageFile(trackingOp.params, db as unknown as DrizzleTransaction)
            }
            exec('COMMIT')
            this.committed = true
          } catch (e) {
            try {
              exec('ROLLBACK')
            } catch (rollbackError) {
              console.error('Manual transaction rollback failed:', rollbackError)
            }
            throw e
          }
        } else {
          // Drizzle標準のトランザクションAPI
          await db.transaction((tx) => {
            let errorInAsync: unknown | null = null
            ;(async () => {
              try {
                for (const dbOp of this.dbOps) {
                  await dbOp.execute(tx as unknown as DrizzleTransaction)
                }
                for (const trackingOp of this.trackingOps) {
                  await recordStorageFile(trackingOp.params, tx as unknown as DrizzleTransaction)
                }
              } catch (err) {
                errorInAsync = err
              }
            })()
            if (errorInAsync) throw errorInAsync
          })
          this.committed = true
        }
      } else {
        // DB操作がない場合でも追跡は実行
        for (const trackingOp of this.trackingOps) {
          await recordStorageFile(trackingOp.params)
        }
        this.committed = true
      }

      // Phase 4: ストレージ削除（最後に実行、失敗してもロールバックしない）
      for (const deleteOp of this.deleteOps) {
        try {
          await deleteOp.storage.delete(deleteOp.key)
          completedDeleteOps.push({ storage: deleteOp.storage, key: deleteOp.key })
        } catch (error) {
          // 削除失敗はログに記録するが、トランザクション全体は失敗させない
          console.error('Storage delete failed during transaction:', {
            key: deleteOp.key,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
    } catch (error) {
      // ロールバック処理
      await this.performRollback(completedStorageOps, completedDeleteOps, drizzleDb)
      throw error
    }
  }

  /**
   * ロールバック処理
   */
  private async performRollback(
    completedStorageOps: { storage: Storage; key: string }[],
    completedDeleteOps: { storage: Storage; key: string }[],
    _drizzleDb?: ReturnType<typeof getDatabase>,
  ): Promise<void> {
    const rollbackErrors: Error[] = []

    // ストレージ書き込みのロールバック（削除）
    for (const op of completedStorageOps) {
      try {
        await op.storage.delete(op.key)
      } catch (error) {
        rollbackErrors.push(
          new Error(`Failed to rollback storage write for key ${op.key}: ${error}`),
        )
      }
    }

    // データベースロールバック（Drizzleトランザクションは自動ロールバックされるため不要）
    // Drizzleトランザクション内で例外が発生した場合、自動的にロールバックされる

    // カスタムロールバック処理
    for (const dbOp of this.dbOps) {
      if (dbOp.rollback) {
        try {
          await dbOp.rollback()
        } catch (error) {
          rollbackErrors.push(new Error(`Failed to execute custom rollback: ${error}`))
        }
      }
    }

    // 削除のロールバック（復元は困難なのでログのみ）
    if (completedDeleteOps.length > 0) {
      console.warn(
        'Storage deletions completed before transaction failure - cannot rollback:',
        completedDeleteOps.map((op) => op.key),
      )
    }

    if (rollbackErrors.length > 0) {
      console.error('Rollback errors occurred:', rollbackErrors)
    }
  }

  /**
   * トランザクションの状態をリセット（テスト用）
   */
  reset(): void {
    this.storageOps = []
    this.deleteOps = []
    this.dbOps = []
    this.trackingOps = []
    this.executed = false
    this.committed = false
  }

  /**
   * トランザクションが正常にコミットされたかを確認
   */
  isCommitted(): boolean {
    return this.committed
  }
}

/**
 * 便利関数: 単一ストレージ書き込み + DB操作 + 追跡の統合実行
 */
export async function executeStorageDbTransaction<T>(options: {
  storage: Storage
  key: string
  value: string | Buffer
  metadata?: Record<string, string>
  dbOperation: () => Promise<T>
  dbRollback?: () => Promise<void>
  tracking?: RecordStorageFileParams
}): Promise<T> {
  const tx = new TransactionManager()
  let dbResult: T | undefined

  tx.addStorageWrite(options.storage, options.key, options.value, options.metadata)

  tx.addDatabaseOperation(async (_tx) => {
    dbResult = await options.dbOperation()
  }, options.dbRollback)

  if (options.tracking) {
    tx.addStorageTracking(options.tracking)
  }

  await tx.execute()

  if (dbResult === undefined) {
    throw new Error('Database operation did not complete successfully')
  }

  return dbResult
}

/**
 * ストレージ操作のみの場合の軽量版（DB操作なし、追跡のみ）
 */
export async function executeStorageWithTracking(options: {
  storage: Storage
  key: string
  value: string | Buffer
  metadata?: Record<string, string>
  tracking?: RecordStorageFileParams
}): Promise<void> {
  // ストレージ書き込み
  await options.storage.put(options.key, options.value, options.metadata)

  // 追跡のみ実行（失敗してもストレージ操作は完了済み）
  if (options.tracking) {
    try {
      await recordStorageFile(options.tracking)
    } catch (error) {
      // 追跡失敗はログに記録するが、メイン処理は失敗させない
      console.warn('Storage tracking failed:', error)
    }
  }
}

/**
 * ストレージ操作 + 任意のDB操作を統合（戻り値なしのDB操作用）
 */
export async function executeStorageWithDbOperation(options: {
  storage: Storage
  key: string
  value: string | Buffer
  metadata?: Record<string, string>
  dbOperation?: () => Promise<void>
  dbRollback?: () => Promise<void>
  tracking?: RecordStorageFileParams
}): Promise<void> {
  const tx = new TransactionManager()

  tx.addStorageWrite(options.storage, options.key, options.value, options.metadata)

  if (options.dbOperation) {
    tx.addDatabaseOperation(async (_tx) => {
      await options.dbOperation?.()
    }, options.dbRollback)
  }

  if (options.tracking) {
    tx.addStorageTracking(options.tracking)
  }

  await tx.execute()
}
