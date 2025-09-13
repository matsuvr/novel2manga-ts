import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schema from '@/db/schema'
import { jobs, storageFiles } from '@/db/schema'
import { getDatabaseServiceFactory } from '@/services/database'

// Drizzle transaction type for internal use
type DrizzleDb = BetterSQLite3Database<typeof schema>
type DrizzleTransaction = Parameters<Parameters<DrizzleDb['transaction']>[0]>[0]

type FileCategory =
  | 'original'
  | 'chunk'
  | 'analysis'
  | 'episode'
  | 'layout'
  | 'render'
  | 'output'
  | 'metadata'
type FileType = 'txt' | 'json' | 'png' | 'jpg' | 'pdf' | 'zip'

export interface RecordStorageFileParams {
  filePath: string
  fileCategory: FileCategory
  fileType: FileType
  novelId?: string
  jobId?: string
  userId?: string
  mimeType?: string
  fileSize?: number
}

/**
 * storage_files テーブルへ追跡レコードを作成（idempotent）。
 * - jobId が与えられた場合は DB から novelId を逆引き
 * - file_path にユニーク制約があるため onConflictDoNothing で冪等に登録
 * - tx パラメータが提供された場合はそのトランザクション内で実行
 */
export async function recordStorageFile(
  params: RecordStorageFileParams,
  tx?: DrizzleTransaction,
): Promise<void> {
  function isDrizzleDb(obj: unknown): obj is DrizzleDb {
    if (!obj || typeof obj !== 'object') return false
    const candidate = obj as { select?: unknown }
    return typeof candidate.select === 'function'
  }
  const raw = tx || getDatabaseServiceFactory().getRawDatabase()
  if (!isDrizzleDb(raw)) {
    throw new Error('recordStorageFile: database is not a Drizzle better-sqlite3 instance')
  }
  const db = raw

  let novelId = params.novelId
  if (!novelId && params.jobId) {
    const rows = await db
      .select({ novelId: jobs.novelId })
      .from(jobs)
      .where(eq(jobs.id, params.jobId))
      .limit(1)
    novelId = rows[0]?.novelId || undefined
  }

  if (!novelId) {
    // novelId は NOT NULL のため、確定できない場合は追跡スキップ（呼び出し元で後続ミスを避ける）
    return
  }

  const id = randomUUID()
  const now = new Date().toISOString()

  await db
    .insert(storageFiles)
    .values({
      id,
      novelId,
      jobId: params.jobId || null, // Convert undefined to null for database
      userId: params.userId || 'anonymous', // Default to 'anonymous' for backward compatibility
      filePath: params.filePath,
      fileCategory: params.fileCategory,
      fileType: params.fileType,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      createdAt: now,
    })
    .onConflictDoNothing()
}

/**
 * Synchronous version of recordStorageFile for use in better-sqlite3 transactions
 */
export function recordStorageFileSync(
  params: RecordStorageFileParams,
  tx: DrizzleTransaction,
): void {
  // For SQLite transactions, we need the novelId upfront since we can't do async operations
  if (!params.novelId && params.jobId) {
    // Try to get novelId from the transaction context
    const rows = tx
      .select({ novelId: jobs.novelId })
      .from(jobs)
      .where(eq(jobs.id, params.jobId))
      .limit(1)
      .all()
    const novelId = rows[0]?.novelId
    if (novelId) {
      params = { ...params, novelId }
    }
  }

  if (!params.novelId) {
    // novelId は NOT NULL のため、確定できない場合は追跡スキップ（呼び出し元で後続ミスを避ける）
    return
  }

  const id = randomUUID()
  const now = new Date().toISOString()

  tx.insert(storageFiles)
    .values({
      id,
      novelId: params.novelId,
      jobId: params.jobId || null, // Convert undefined to null for database
      userId: params.userId || 'anonymous', // Default to 'anonymous' for backward compatibility
      filePath: params.filePath,
      fileCategory: params.fileCategory,
      fileType: params.fileType,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      createdAt: now,
    })
    .onConflictDoNothing()
    .run()
}
