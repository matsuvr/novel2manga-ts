import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import { type Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { isDevelopment } from '@/config'
import type { ChunkAnalysisResult, ChunkData } from '@/types/chunk'
import type { EpisodeBoundary } from '@/types/episode'

// CloudflareランタイムのglobalThis拡張
declare global {
  var NOVEL_STORAGE: any
  var DB: any
}

// ========================================
// Storage Interfaces
// ========================================

export interface Storage {
  put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void>
  get(key: string): Promise<{ text: string; metadata?: Record<string, string> } | null>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
  list?(prefix?: string): Promise<string[]>
}

export interface DatabaseAdapter {
  prepare(query: string): any
  run(query: string, params?: any[]): Promise<any>
  get(query: string, params?: any[]): Promise<any>
  all(query: string, params?: any[]): Promise<any[]>
  batch(statements: any[]): Promise<any[]>
  close(): Promise<void>
}

// ========================================
// Environment Detection
// ========================================

// ベースストレージパス
const STORAGE_BASE = '.local-storage'

// 開発環境用のローカルストレージパス
const getStorageBase = () => {
  // テスト環境では.test-storageを使用
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.join(process.cwd(), '.test-storage')
  }
  return path.join(process.cwd(), '.local-storage')
}

const LOCAL_STORAGE_BASE = getStorageBase()
const NOVELS_DIR = path.join(LOCAL_STORAGE_BASE, 'novels')
const CHUNKS_DIR = path.join(LOCAL_STORAGE_BASE, 'chunks')
const ANALYSES_DIR = path.join(LOCAL_STORAGE_BASE, 'analyses')
const LAYOUTS_DIR = path.join(LOCAL_STORAGE_BASE, 'layouts')
const RENDERS_DIR = path.join(LOCAL_STORAGE_BASE, 'renders')
const DB_PATH = path.join(LOCAL_STORAGE_BASE, 'database.sqlite')

// ========================================
// Legacy Helper Functions (後方互換性)
// ========================================

function _getChunkKey(novelId: string, chunkIndex: number): string {
  return `${novelId}:${chunkIndex}`
}

function _getEpisodeKey(novelId: string): string {
  return novelId
}

// ストレージパスヘルパー
function getNovelPath(novelId: string): string {
  return path.join(STORAGE_BASE, 'novels', `${novelId}.json`)
}

function getAnalysisPath(novelId: string, chunkIndex: number): string {
  return path.join(STORAGE_BASE, 'analysis', novelId, `chunk_${chunkIndex}.json`)
}

function getEpisodePath(novelId: string): string {
  return path.join(STORAGE_BASE, 'episodes', `${novelId}.json`)
}

// ディレクトリ作成ヘルパー
async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

// ローカルファイルストレージ実装
class LocalFileStorage implements Storage {
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
}

// R2ストレージ実装
class R2Storage implements Storage {
  constructor(private bucket: any) {}

  async put(key: string, value: string | Buffer, metadata?: Record<string, string>): Promise<void> {
    await this.bucket.put(key, value, {
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
}

// SQLiteアダプター（開発環境用）
class SQLiteAdapter implements DatabaseAdapter {
  private db: Database | null = null

  async getDb(): Promise<Database> {
    if (!this.db) {
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

    // Novelテーブル
    await this.db.exec(`
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
      )
    `)

    // Jobテーブル
    await this.db.exec(`
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
      )
    `)

    // Chunkテーブル
    await this.db.exec(`
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
      )
    `)

    // Episodeテーブル
    await this.db.exec(`
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
      )
    `)
  }

  prepare(query: string) {
    // SQLiteのprepareは同期的な操作のため、runやgetメソッド内で処理
    return { query, bind: (params: any[]) => ({ query, params }) }
  }

  async run(query: string, params?: any[]): Promise<any> {
    const db = await this.getDb()
    return db.run(query, params)
  }

  async get(query: string, params?: any[]): Promise<any> {
    const db = await this.getDb()
    return db.get(query, params)
  }

  async all(query: string, params?: any[]): Promise<any[]> {
    const db = await this.getDb()
    return db.all(query, params)
  }

  async batch(statements: any[]): Promise<any[]> {
    const db = await this.getDb()
    const results = []
    // トランザクション開始
    await db.run('BEGIN TRANSACTION')
    try {
      for (const stmt of statements) {
        const result = await db.run(stmt.query, stmt.params)
        results.push(result)
      }
      await db.run('COMMIT')
      return results
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close()
      this.db = null
    }
  }
}

// D1アダプター（本番環境用）
class D1Adapter implements DatabaseAdapter {
  constructor(private d1: any) {}

  prepare(query: string) {
    return this.d1.prepare(query)
  }

  async run(query: string, params?: any[]): Promise<any> {
    const stmt = this.prepare(query)
    if (params && params.length > 0) {
      return stmt.bind(...params).run()
    }
    return stmt.run()
  }

  async get(query: string, params?: any[]): Promise<any> {
    const stmt = this.prepare(query)
    if (params && params.length > 0) {
      return stmt.bind(...params).first()
    }
    return stmt.first()
  }

  async all(query: string, params?: unknown[]): Promise<unknown[]> {
    const stmt = this.prepare(query)
    let result: unknown
    if (params && params.length > 0) {
      result = await stmt.bind(...params).all()
    } else {
      result = await stmt.all()
    }
    return (result as any).results || []
  }

  async batch(statements: any[]): Promise<any[]> {
    const preparedStatements = statements.map((stmt) => {
      const prepared = this.prepare(stmt.query)
      if (stmt.params && stmt.params.length > 0) {
        return prepared.bind(...stmt.params)
      }
      return prepared
    })
    return this.d1.batch(preparedStatements)
  }

  async close(): Promise<void> {
    // D1は接続管理が不要
  }
}

// ストレージファクトリー
export namespace StorageFactory {
  export async function getNovelStorage(): Promise<Storage> {
    if (isDevelopment()) {
      return new LocalFileStorage(NOVELS_DIR)
    }
    if (globalThis.NOVEL_STORAGE) {
      return new R2Storage(globalThis.NOVEL_STORAGE)
    }
    throw new Error('Novel storage not configured')
  }

  export async function getChunkStorage(): Promise<Storage> {
    if (isDevelopment()) {
      return new LocalFileStorage(CHUNKS_DIR)
    }
    if (globalThis.NOVEL_STORAGE) {
      return new R2Storage(globalThis.NOVEL_STORAGE)
    }
    throw new Error('Chunk storage not configured')
  }

  export async function getAnalysisStorage(): Promise<Storage> {
    if (isDevelopment()) {
      return new LocalFileStorage(ANALYSES_DIR)
    }
    if (globalThis.NOVEL_STORAGE) {
      return new R2Storage(globalThis.NOVEL_STORAGE)
    }
    throw new Error('Analysis storage not configured')
  }

  export async function getLayoutStorage(): Promise<Storage> {
    if (isDevelopment()) {
      return new LocalFileStorage(LAYOUTS_DIR)
    }
    if (globalThis.NOVEL_STORAGE) {
      return new R2Storage(globalThis.NOVEL_STORAGE)
    }
    throw new Error('Layout storage not configured')
  }

  export async function getRenderStorage(): Promise<Storage> {
    if (isDevelopment()) {
      return new LocalFileStorage(RENDERS_DIR)
    }
    if (globalThis.NOVEL_STORAGE) {
      return new R2Storage(globalThis.NOVEL_STORAGE)
    }
    throw new Error('Render storage not configured')
  }

  export async function getDatabase(): Promise<DatabaseAdapter> {
    if (isDevelopment()) {
      await ensureDir(LOCAL_STORAGE_BASE)
      return new SQLiteAdapter()
    }
    if (globalThis.DB) {
      return new D1Adapter(globalThis.DB)
    }
    throw new Error('Database not configured')
  }
}

// ストレージキー生成ヘルパー
export const StorageKeys = {
  novel: (uuid: string) => `novels/${uuid}.json`,
  chunk: (chunkId: string) => `chunks/${chunkId}.json`,
  chunkAnalysis: (jobId: string, chunkIndex: number) =>
    `analyses/${jobId}/chunk_${chunkIndex}.json`,
  integratedAnalysis: (jobId: string) => `analyses/${jobId}/integrated.json`,
  narrativeAnalysis: (jobId: string) => `analyses/${jobId}/narrative.json`,
  episodeLayout: (jobId: string, episodeNumber: number) =>
    `layouts/${jobId}/episode_${episodeNumber}.yaml`,
  pageRender: (jobId: string, episodeNumber: number, pageNumber: number) =>
    `renders/${jobId}/episode_${episodeNumber}/page_${pageNumber}.png`,
}

export async function saveChunkData(
  _novelId: string,
  _chunkIndex: number,
  _data: ChunkData,
): Promise<void> {
  // メモリストレージは使用せず、小説データから動的に生成
  // チャンク情報はDBに保存されている
}

export async function getChunkData(jobId: string, chunkIndex: number): Promise<ChunkData | null> {
  try {
    // StorageFactoryを使って実際に保存されたチャンクファイルを読み込む
    const chunkStorage = await StorageFactory.getChunkStorage()
    const chunkPath = `chunks/${jobId}/chunk_${chunkIndex}.txt`
    
    const chunkFile = await chunkStorage.get(chunkPath)
    if (!chunkFile) {
      console.error(`Chunk file not found: ${chunkPath}`)
      return null
    }

    // JSONファイルから内容を取得
    let chunkContent: string
    try {
      const parsedData = JSON.parse(chunkFile.text)
      chunkContent = parsedData.content
    } catch {
      // JSONパースに失敗した場合は直接テキストとして使用
      chunkContent = chunkFile.text
    }

    if (!chunkContent) {
      console.error(`Empty chunk content: ${chunkPath}`)
      return null
    }

    return {
      chunkIndex,
      text: chunkContent,
      startPosition: 0, // 実際の位置情報が必要な場合はDBから取得
      endPosition: chunkContent.length,
    }
  } catch (error) {
    console.error(`Failed to get chunk data for ${jobId}:${chunkIndex}:`, error)
    return null
  }
}

export async function saveChunkAnalysis(
  novelId: string,
  chunkIndex: number,
  analysis: ChunkAnalysisResult,
): Promise<void> {
  const analysisPath = getAnalysisPath(novelId, chunkIndex)
  const dir = path.dirname(analysisPath)
  await ensureDir(dir)

  const data = {
    novelId,
    chunkIndex,
    analysis,
    savedAt: new Date().toISOString(),
  }

  await fs.writeFile(analysisPath, JSON.stringify(data, null, 2))
}

export async function getChunkAnalysis(
  jobId: string,
  chunkIndex: number,
): Promise<ChunkAnalysisResult | null> {
  try {
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const analysisPath = `analyses/${jobId}/chunk_${chunkIndex}.json`
    const analysisFile = await analysisStorage.get(analysisPath)
    
    if (!analysisFile) {
      console.error(`Analysis file not found: ${analysisPath}`)
      return null
    }
    
    const data = JSON.parse(analysisFile.text)
    return data.analysis || null
  } catch (error) {
    console.error(`Failed to get chunk analysis: ${error}`)
    return null
  }
}

export async function saveEpisodeBoundaries(
  novelId: string,
  boundaries: EpisodeBoundary[],
): Promise<void> {
  const episodePath = getEpisodePath(novelId)
  const dir = path.dirname(episodePath)
  await ensureDir(dir)

  // 既存のデータを読み込む
  let existingData: { novelId: string; boundaries: EpisodeBoundary[]; savedAt: string } | null =
    null
  try {
    const fileContent = await fs.readFile(episodePath, 'utf-8')
    existingData = JSON.parse(fileContent)
  } catch (_error) {
    // ファイルが存在しない場合は新規作成
  }

  // 既存のboundariesと新しいboundariesをマージ
  let mergedBoundaries: EpisodeBoundary[] = []

  if (existingData?.boundaries) {
    // 既存のエピソードと新しいエピソードをマージ
    const existingMap = new Map<string, EpisodeBoundary>()

    // 既存のエピソードをMapに格納（startChunk-endChunkをキーとして）
    existingData.boundaries.forEach((boundary) => {
      const key = `${boundary.startChunk}-${boundary.endChunk}`
      existingMap.set(key, boundary)
    })

    // 新しいエピソードを追加（重複する場合は上書き）
    boundaries.forEach((boundary) => {
      const key = `${boundary.startChunk}-${boundary.endChunk}`
      existingMap.set(key, boundary)
    })

    // Mapから配列に変換し、startChunkでソート
    mergedBoundaries = Array.from(existingMap.values()).sort((a, b) => a.startChunk - b.startChunk)

    // エピソード番号を再割り当て
    mergedBoundaries.forEach((boundary, index) => {
      boundary.episodeNumber = index + 1
    })
  } else {
    mergedBoundaries = boundaries
  }

  const data = {
    novelId,
    boundaries: mergedBoundaries,
    savedAt: new Date().toISOString(),
  }

  await fs.writeFile(episodePath, JSON.stringify(data, null, 2))
}

export async function getEpisodeBoundaries(novelId: string): Promise<EpisodeBoundary[] | null> {
  try {
    const episodePath = getEpisodePath(novelId)
    const data = JSON.parse(await fs.readFile(episodePath, 'utf-8'))
    return data.boundaries || null
  } catch (error) {
    console.error(`Failed to get episode boundaries: ${error}`)
    return null
  }
}

export async function getAllChunksForNovel(novelId: string): Promise<ChunkData[]> {
  const chunks: ChunkData[] = []

  try {
    // 小説データから全チャンクを生成
    const novelPath = getNovelPath(novelId)
    const novelData = JSON.parse(await fs.readFile(novelPath, 'utf-8'))

    if (!novelData.text) {
      return []
    }

    // チャンク設定を取得
    const { getChunkingConfig } = await import('@/config')
    const chunkingConfig = getChunkingConfig()
    const chunkSize = chunkingConfig.defaultChunkSize
    const overlapSize = chunkingConfig.defaultOverlapSize
    const stepSize = chunkSize - overlapSize
    const totalChunks = Math.ceil(novelData.text.length / stepSize)

    for (let i = 0; i < totalChunks; i++) {
      const chunk = await getChunkData(novelId, i)
      if (chunk) {
        chunks.push(chunk)
      }
    }
  } catch (error) {
    console.error(`Failed to get all chunks: ${error}`)
  }

  return chunks
}

export async function clearNovelData(novelId: string): Promise<void> {
  try {
    // 小説データの削除
    const novelPath = getNovelPath(novelId)
    await fs.unlink(novelPath).catch(() => {
      // ファイルが存在しない場合は無視
    })

    // 分析データの削除
    const analysisDir = path.dirname(getAnalysisPath(novelId, 0))
    await fs.rm(analysisDir, { recursive: true, force: true }).catch(() => {
      // ディレクトリが存在しない場合は無視
    })

    // エピソードデータの削除
    const episodePath = getEpisodePath(novelId)
    await fs.unlink(episodePath).catch(() => {
      // ファイルが存在しない場合は無視
    })
  } catch (error) {
    console.error(`Failed to clear novel data: ${error}`)
  }
}
