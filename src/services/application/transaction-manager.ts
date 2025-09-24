import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { getDatabaseServiceFactory } from '@/services/database'
import type { Storage } from '@/utils/storage'
import { type RecordStorageFileParams, recordStorageFile, recordStorageFileSync } from './storage-tracker'

// Drizzle transaction type
type DrizzleDb = BetterSQLite3Database<typeof schema>
type DrizzleTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]

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
  // better-sqlite3(drizzle) の同期トランザクション内で実行されるため Promise を返さない (契約)
  // ただしランタイムで誤って Promise を返した場合検知できるよう unknown を返り値型にする
  execute: (tx?: DrizzleTransaction) => unknown
  // rollback は外部（トランザクション外）で async 可
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
    execute: (tx?: DrizzleTransaction) => unknown,
    rollback?: () => Promise<void>,
  ): void {
    if (this.executed) {
      throw new Error('Cannot add operations after execution started')
    }
    // 型的には void だが、呼び出し側が誤って async を渡した場合早期検知
    if (execute.constructor && execute.constructor.name === 'AsyncFunction') {
      throw new Error(
        'addDatabaseOperation received an async function. DB ops must be synchronous to ensure transactional consistency. Pre-run external async work before registering the operation.',
      )
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
    let drizzleDb: unknown | undefined

    try {
      // Phase 1: ストレージ書き込み（可視性確認まで完了）
      for (const op of this.storageOps) {
        await op.storage.put(op.key, op.value, op.metadata)
        completedStorageOps.push({ storage: op.storage, key: op.key })
      }

      // Phase 2: データベース操作（Drizzle トランザクション）。
      // Drizzle(better-sqlite3) の transaction コールバックは同期実行前提
      // -> ここでは非同期 I/O (storage 等) を一切含めないことを保証済み。
      if (this.dbOps.length > 0 || this.trackingOps.length > 0) {
        const raw = getDatabaseServiceFactory().getRawDatabase()
        drizzleDb = raw

        const isDrizzleDb = (obj: unknown): obj is DrizzleDb => {
          if (!obj || typeof obj !== 'object') return false
          return typeof (obj as { select?: unknown }).select === 'function'
        }
        if (!isDrizzleDb(raw)) {
          throw new Error('Database is not a Drizzle better-sqlite3 instance')
        }

        // Drizzle(better-sqlite3) の transaction は同期だが、テスト用 Mock では async になっている。
        // どちらにも対応するため戻り値が thenable なら await する。
        const isPromiseLike = (v: unknown): v is Promise<unknown> =>
          !!v && (typeof v === 'object' || typeof v === 'function') && 'then' in v

        const result = (raw as DrizzleDb).transaction((tx) => {
          for (const dbOp of this.dbOps) {
            const r: unknown = dbOp.execute(tx as unknown as DrizzleTransaction)
            if (isPromiseLike(r)) {
              throw new Error(
                'Detected Promise return from database operation inside synchronous transaction. Refactor to perform async work before entering TransactionManager.',
              )
            }
          }
          for (const trackingOp of this.trackingOps) {
            recordStorageFileSync(trackingOp.params, tx as unknown as DrizzleTransaction)
          }
        })
        // Drizzle/better-sqlite3 は同期だが、テスト用 Mock は Promise を返す場合があるので await
        if (isPromiseLike(result)) {
          await result
        }
        this.committed = true
      } else {
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
      // ロールバック処理: 既に書き込んだ storage を削除
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
    _drizzleDb?: unknown,
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
  // 同期 DB 操作（値を返す）。内部で Drizzle(better-sqlite3) を想定。
  dbOperation: () => T
  dbRollback?: () => Promise<void>
  tracking?: RecordStorageFileParams
}): Promise<T> {
  const tx = new TransactionManager()
  let dbResult: T | undefined
  let dbOperationExecuted = false

  tx.addStorageWrite(options.storage, options.key, options.value, options.metadata)

  tx.addDatabaseOperation((_tx) => {
    dbResult = options.dbOperation()
    dbOperationExecuted = true
  }, options.dbRollback)

  if (options.tracking) {
    tx.addStorageTracking(options.tracking)
  }

  await tx.execute()

  // Check if the database operation was executed (not just if result has a value)
  // This handles void operations correctly
  if (!dbOperationExecuted) {
    throw new Error('Database operation did not execute successfully')
  }

  return dbResult as T
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
      // トランザクション外なので非同期版を使用
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
  // better-sqlite3 用の同期 DB 操作
  dbOperation?: () => void
  dbRollback?: () => Promise<void>
  tracking?: RecordStorageFileParams
}): Promise<void> {
  const tx = new TransactionManager()

  tx.addStorageWrite(options.storage, options.key, options.value, options.metadata)

  if (options.dbOperation) {
    tx.addDatabaseOperation((_tx) => {
      options.dbOperation?.()
    }, options.dbRollback)
  }

  if (options.tracking) {
    tx.addStorageTracking(options.tracking)
  }

  await tx.execute()
}
