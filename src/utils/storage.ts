import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import type { Database } from 'sqlite'
import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { isDevelopment } from '@/config'

// ========================================
// Storage Interfaces (設計書対応)
// ========================================

export interface Storage {
  put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void>
  get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  list?(prefix?: string): Promise<string[]>
}

export interface DatabaseAdapter {
  prepare(query: string): PreparedStatement
  run(query: string, params?: unknown[]): Promise<QueryResult>
  get(query: string, params?: unknown[]): Promise<Record<string, unknown> | null>
  all(query: string, params?: unknown[]): Promise<Record<string, unknown>[]>
  batch(statements: PreparedStatement[]): Promise<QueryResult[]>
  close(): Promise<void>
}

export interface PreparedStatement {
  query: string
  params?: unknown[]
  d1Statement?: D1PreparedStatement
}

export interface QueryResult {
  changes?: number
  lastInsertRowid?: number
  success?: boolean
  meta?: Record<string, unknown>
}

// ========================================
// Environment Detection
// ========================================

// 開発環境用のローカルストレージパス
const getStorageBase = () => {
  // テスト環境では.test-storageを使用
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.join(process.cwd(), '.test-storage')
  }
  return path.join(process.cwd(), '.local-storage')
}

const LOCAL_STORAGE_BASE = getStorageBase()
const DB_PATH = path.join(LOCAL_STORAGE_BASE, 'database.sqlite')

// ディレクトリ作成ヘルパー
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

// ========================================
// Local File Storage Implementation
// ========================================

export class LocalFileStorage implements Storage {
  constructor(private baseDir: string) {}

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    await ensureDir(this.baseDir)
    const filePath = path.join(this.baseDir, key)
    const dir = path.dirname(filePath)
    await ensureDir(dir)

    const data = {
      content: value.toString(),
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    }

    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const filePath = path.join(this.baseDir, key)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)
      return {
        text: data.content,
        metadata: data.metadata,
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key)
    try {
      await fs.unlink(filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, key)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async list(prefix?: string): Promise<string[]> {
    const baseDir = prefix ? path.join(this.baseDir, prefix) : this.baseDir
    try {
      const files = await fs.readdir(baseDir, { recursive: true })
      return files
        .filter((file) => typeof file === 'string')
        .map((file) => (prefix ? path.join(prefix, file as string) : (file as string)))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return []
      }
      throw error
    }
  }
}

// ========================================
// R2 Storage Implementation
// ========================================

// Cloudflare R2 Bucket型定義
interface R2Bucket {
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ): Promise<unknown>
  get(key: string): Promise<{
    text(): Promise<string>
    customMetadata?: Record<string, string>
  } | null>
  delete(key: string): Promise<void>
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>
  list(options?: { prefix?: string }): Promise<{
    objects: Array<{ key: string }>
  }>
}

export class R2Storage implements Storage {
  constructor(private bucket: R2Bucket) {}

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    const valueToStore = typeof value === 'string' ? value : value.toString()
    await this.bucket.put(key, valueToStore, {
      httpMetadata: {
        contentType: 'application/json; charset=utf-8',
      },
      customMetadata: metadata,
    })
  }

  async get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null> {
    const object = await this.bucket.get(key)
    if (!object) return null

    const text = await object.text()
    return {
      text,
      metadata: object.customMetadata || {},
    }
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key)
  }

  async exists(key: string): Promise<boolean> {
    const object = await this.bucket.head(key)
    return !!object
  }

  async list(prefix?: string): Promise<string[]> {
    const result = await this.bucket.list(prefix ? { prefix } : undefined)
    return result.objects.map((obj) => obj.key)
  }
}

// ========================================
// SQLite Adapter Implementation (Development)
// ========================================

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database | null = null

  async getDb(): Promise<Database> {
    if (!this.db) {
      await ensureDir(path.dirname(DB_PATH))
      this.db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database,
      })

      // スキーマを初期化
      await this.initializeSchema()
    }
    return this.db
  }

  private async initializeSchema(): Promise<void> {
    if (!this.db) return

    // 設計書通りのスキーマを実装
    await this.db.exec(`
      -- Novel テーブル
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        title TEXT,
        author TEXT,
        original_text_path TEXT NOT NULL,
        text_length INTEGER NOT NULL,
        language TEXT DEFAULT 'ja',
        metadata_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Job テーブル
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT NOT NULL DEFAULT 'initialized',
        split_completed BOOLEAN DEFAULT FALSE,
        analyze_completed BOOLEAN DEFAULT FALSE,
        episode_completed BOOLEAN DEFAULT FALSE,
        layout_completed BOOLEAN DEFAULT FALSE,
        render_completed BOOLEAN DEFAULT FALSE,
        chunks_dir_path TEXT,
        analyses_dir_path TEXT,
        episodes_data_path TEXT,
        layouts_dir_path TEXT,
        renders_dir_path TEXT,
        total_chunks INTEGER DEFAULT 0,
        processed_chunks INTEGER DEFAULT 0,
        total_episodes INTEGER DEFAULT 0,
        processed_episodes INTEGER DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        rendered_pages INTEGER DEFAULT 0,
        last_error TEXT,
        last_error_step TEXT,
        retry_count INTEGER DEFAULT 0,
        resume_data_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
      );

      -- JobStepHistory テーブル
      CREATE TABLE IF NOT EXISTS job_step_history (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at DATETIME NOT NULL,
        completed_at DATETIME,
        duration_seconds INTEGER,
        input_path TEXT,
        output_path TEXT,
        error_message TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      -- Chunk テーブル
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content_path TEXT NOT NULL,
        start_position INTEGER NOT NULL,
        end_position INTEGER NOT NULL,
        word_count INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, chunk_index)
      );

      -- ChunkAnalysisStatus テーブル
      CREATE TABLE IF NOT EXISTS chunk_analysis_status (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        is_analyzed BOOLEAN DEFAULT FALSE,
        analysis_path TEXT,
        analyzed_at DATETIME,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, chunk_index)
      );

      -- Episode テーブル
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        episode_number INTEGER NOT NULL,
        title TEXT,
        summary TEXT,
        start_chunk INTEGER NOT NULL,
        start_char_index INTEGER NOT NULL,
        end_chunk INTEGER NOT NULL,
        end_char_index INTEGER NOT NULL,
        estimated_pages INTEGER NOT NULL,
        confidence REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, episode_number)
      );

      -- LayoutStatus テーブル
      CREATE TABLE IF NOT EXISTS layout_status (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        episode_number INTEGER NOT NULL,
        is_generated BOOLEAN DEFAULT FALSE,
        layout_path TEXT,
        total_pages INTEGER,
        total_panels INTEGER,
        generated_at DATETIME,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, episode_number)
      );

      -- RenderStatus テーブル
      CREATE TABLE IF NOT EXISTS render_status (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        episode_number INTEGER NOT NULL,
        page_number INTEGER NOT NULL,
        is_rendered BOOLEAN DEFAULT FALSE,
        image_path TEXT,
        thumbnail_path TEXT,
        width INTEGER,
        height INTEGER,
        file_size INTEGER,
        rendered_at DATETIME,
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(job_id, episode_number, page_number)
      );

      -- Output テーブル
      CREATE TABLE IF NOT EXISTS outputs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        output_type TEXT NOT NULL,
        output_path TEXT NOT NULL,
        file_size INTEGER,
        page_count INTEGER,
        metadata_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      -- StorageFiles テーブル
      CREATE TABLE IF NOT EXISTS storage_files (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        job_id TEXT,
        file_path TEXT NOT NULL,
        file_category TEXT NOT NULL,
        file_type TEXT NOT NULL,
        mime_type TEXT,
        file_size INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
        UNIQUE(file_path)
      );

      -- インデックス作成
      CREATE INDEX IF NOT EXISTS idx_jobs_novel_id ON jobs(novel_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_novel_id ON chunks(novel_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_job_id ON chunks(job_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_novel_id ON episodes(novel_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_job_id ON episodes(job_id);
      CREATE INDEX IF NOT EXISTS idx_chunk_analysis_job_id ON chunk_analysis_status(job_id);
      CREATE INDEX IF NOT EXISTS idx_layout_status_job_id ON layout_status(job_id);
      CREATE INDEX IF NOT EXISTS idx_render_status_job_id ON render_status(job_id);
      CREATE INDEX IF NOT EXISTS idx_storage_files_novel_id ON storage_files(novel_id);
      CREATE INDEX IF NOT EXISTS idx_storage_files_job_id ON storage_files(job_id);
    `)
  }

  prepare(query: string): PreparedStatement {
    return { query }
  }

  async run(query: string, params?: unknown[]): Promise<QueryResult> {
    const db = await this.getDb()
    const result = await db.run(query, params)
    return {
      changes: result.changes,
      lastInsertRowid: result.lastID,
      success: true,
    }
  }

  async get(query: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    const db = await this.getDb()
    const result = await db.get(query, params)
    return result || null
  }

  async all(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const db = await this.getDb()
    return db.all(query, params)
  }

  async batch(statements: PreparedStatement[]): Promise<QueryResult[]> {
    const db = await this.getDb()
    const results: QueryResult[] = []

    // トランザクション開始
    await db.run('BEGIN TRANSACTION')

    try {
      for (const stmt of statements) {
        const result = await db.run(stmt.query, stmt.params)
        results.push({
          changes: result.changes,
          lastInsertRowid: result.lastID,
          success: true,
        })
      }
      await db.run('COMMIT')
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }

    return results
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
}

// ========================================
// D1 Adapter Implementation (Production)
// ========================================

// Cloudflare D1 Database型定義
interface D1Database {
  prepare(query: string): D1PreparedStatement
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>
  exec(query: string): Promise<D1ExecResult>
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[]; success: boolean }>
  run(): Promise<D1Result>
}

interface D1Result {
  changes: number
  duration: number
  last_row_id: number
  served_by: string
  success: boolean
  meta: Record<string, unknown>
}

interface D1ExecResult {
  count: number
  duration: number
}

export class D1Adapter implements DatabaseAdapter {
  constructor(private db: D1Database) {}

  prepare(query: string): PreparedStatement {
    const stmt = this.db.prepare(query)
    return {
      query,
      d1Statement: stmt,
    }
  }

  async run(query: string, params?: unknown[]): Promise<QueryResult> {
    const stmt = this.db.prepare(query)
    const boundStmt = params ? stmt.bind(...params) : stmt
    const result = await boundStmt.run()

    return {
      changes: result.changes,
      lastInsertRowid: result.last_row_id,
      success: result.success,
      meta: result.meta,
    }
  }

  async get(query: string, params?: unknown[]): Promise<Record<string, unknown> | null> {
    const stmt = this.db.prepare(query)
    const boundStmt = params ? stmt.bind(...params) : stmt
    return boundStmt.first()
  }

  async all(query: string, params?: unknown[]): Promise<Record<string, unknown>[]> {
    const stmt = this.db.prepare(query)
    const boundStmt = params ? stmt.bind(...params) : stmt
    const result = await boundStmt.all()
    return result.results
  }

  async batch(statements: PreparedStatement[]): Promise<QueryResult[]> {
    const d1Statements = statements.map((stmt) => {
      const prepared = this.db.prepare(stmt.query)
      return stmt.params ? prepared.bind(...stmt.params) : prepared
    })

    const results = await this.db.batch(d1Statements)

    return results.map((result) => ({
      changes: result.changes,
      lastInsertRowid: result.last_row_id,
      success: result.success,
      meta: result.meta,
    }))
  }

  async close(): Promise<void> {
    // D1は自動的にクリーンアップされるため、特別な処理は不要
  }
}

// ========================================
// Storage Factory (設計書対応)
// ========================================

// Novel Storage
export async function getNovelStorage(): Promise<Storage> {
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, 'novels'))
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new R2Storage(globalThis.NOVEL_STORAGE)
  }
}

// Chunk Storage
export async function getChunkStorage(): Promise<Storage> {
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, 'chunks'))
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new R2Storage(globalThis.CHUNKS_STORAGE)
  }
}

// Analysis Storage
export async function getAnalysisStorage(): Promise<Storage> {
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, 'analysis'))
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new R2Storage(globalThis.ANALYSIS_STORAGE)
  }
}

// Layout Storage
export async function getLayoutStorage(): Promise<Storage> {
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, 'layouts'))
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new R2Storage(globalThis.ANALYSIS_STORAGE) // 同じバケットを使用
  }
}

// Render Storage
export async function getRenderStorage(): Promise<Storage> {
  if (isDevelopment()) {
    return new LocalFileStorage(path.join(LOCAL_STORAGE_BASE, 'renders'))
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new R2Storage(globalThis.ANALYSIS_STORAGE) // 同じバケットを使用
  }
}

// Database
export async function getDatabase(): Promise<DatabaseAdapter> {
  if (isDevelopment()) {
    return new SQLiteAdapter()
  } else {
    // @ts-ignore: Cloudflare Workers環境でのみ利用可能
    return new D1Adapter(globalThis.DB)
  }
}

// ========================================
// Legacy Functions (後方互換性)
// ========================================

// 既存のコードとの互換性を保つためのヘルパー関数
export function getChunkKey(novelId: string, chunkIndex: number): string {
  return `${novelId}:${chunkIndex}`
}

export function getEpisodeKey(novelId: string): string {
  return novelId
}

export function getNovelPath(novelId: string): string {
  return path.join('novels', `${novelId}.json`)
}

export function getAnalysisPath(novelId: string, chunkIndex: number): string {
  return path.join('analysis', novelId, `chunk_${chunkIndex}.json`)
}

export function getEpisodePath(novelId: string): string {
  return path.join('episodes', `${novelId}.json`)
}

// 既存の関数のエクスポート（レガシーサポート用）
export async function saveChunkData(
  novelId: string,
  chunkIndex: number,
  data: unknown,
): Promise<void> {
  const storage = await getChunkStorage()
  const key = `${novelId}/chunk_${chunkIndex}.json`
  await storage.put(key, JSON.stringify(data, null, 2))
}

export async function getChunkData(novelId: string, chunkIndex: number): Promise<unknown | null> {
  const storage = await getChunkStorage()
  const key = `${novelId}/chunk_${chunkIndex}.json`
  const result = await storage.get(key)
  return result ? JSON.parse(result.text) : null
}

// ========================================
// Storage Keys & Factory (Public API)
// ========================================

export const StorageKeys = {
  novel: (uuid: string) => `novels/${uuid}.json`,
  chunk: (chunkId: string) => `chunks/${chunkId}.json`,
  chunkAnalysis: (jobId: string, index: number) => `analyses/${jobId}/chunk_${index}.json`,
  integratedAnalysis: (jobId: string) => `analyses/${jobId}/integrated.json`,
  narrativeAnalysis: (jobId: string) => `analyses/${jobId}/narrative.json`,
  episodeLayout: (jobId: string, episodeNumber: number) =>
    `layouts/${jobId}/episode_${episodeNumber}.yaml`,
  pageRender: (jobId: string, episodeNumber: number, pageNumber: number) =>
    `renders/${jobId}/episode_${episodeNumber}/page_${pageNumber}.png`,
} as const

export const StorageFactory = {
  getNovelStorage,
  getChunkStorage,
  getAnalysisStorage,
  getLayoutStorage,
  getRenderStorage,
  getDatabase,
} as const
