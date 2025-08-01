import fs from 'node:fs/promises'
import path from 'node:path'
import { type Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'

// 開発環境用のSQLiteデータベースパス
const DB_PATH = path.join(process.cwd(), '.local-storage', 'novel2manga.db')

// D1のバインディング型定義
interface D1Database {
  prepare(query: string): D1PreparedStatement
}

interface D1PreparedStatement {
  bind(...values: any[]): D1PreparedStatement
  first(): Promise<any>
  run(): Promise<any>
  all(): Promise<{ results: any[] }>
}

// データベース接続の型定義
export type DBConnection = Database | D1Database

// データベース接続を取得（開発環境用）
export async function getDevDatabase(): Promise<Database> {
  // ディレクトリが存在しない場合は作成
  const dir = path.dirname(DB_PATH)
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }

  return open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  })
}

// 環境に応じたデータベース接続を取得
export async function getDatabase(): Promise<DBConnection> {
  if (process.env.NODE_ENV === 'development') {
    return getDevDatabase()
  }

  // 本番環境：D1を使用
  // @ts-expect-error - D1バインディングはランタイムで利用可能
  if (globalThis.DB) {
    // @ts-expect-error - D1バインディングはランタイムで利用可能
    return globalThis.DB as D1Database
  }

  throw new Error('データベースが設定されていません')
}

// データベースがD1かどうかを判定
export function isD1Database(db: DBConnection): db is D1Database {
  return 'prepare' in db && !('exec' in db)
}

// 統一されたクエリ実行関数
export async function runQuery(db: DBConnection, query: string, params: any[] = []): Promise<any> {
  if (isD1Database(db)) {
    // D1の場合
    const stmt = db.prepare(query)
    if (params.length > 0) {
      stmt.bind(...params)
    }
    return await stmt.run()
  } else {
    // SQLiteの場合
    return await db.run(query, params)
  }
}

// 統一された単一行取得関数
export async function getOne(db: DBConnection, query: string, params: any[] = []): Promise<any> {
  if (isD1Database(db)) {
    // D1の場合
    const stmt = db.prepare(query)
    if (params.length > 0) {
      stmt.bind(...params)
    }
    return await stmt.first()
  } else {
    // SQLiteの場合
    return await db.get(query, params)
  }
}

// 統一された複数行取得関数
export async function getAll(db: DBConnection, query: string, params: any[] = []): Promise<any[]> {
  if (isD1Database(db)) {
    // D1の場合
    const stmt = db.prepare(query)
    if (params.length > 0) {
      stmt.bind(...params)
    }
    const result = await stmt.all()
    return result.results
  } else {
    // SQLiteの場合
    return await db.all(query, params)
  }
}

// バッチ操作の実装（D1ベストプラクティス）
export async function batchInsert(
  db: DBConnection,
  table: string,
  columns: string[],
  values: any[][],
): Promise<void> {
  if (values.length === 0) return

  if (isD1Database(db)) {
    // D1の場合: バッチ操作を使用
    const placeholders = values.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')

    const flatValues = values.flat()
    const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders}`

    await runQuery(db, query, flatValues)
  } else {
    // SQLiteの場合: トランザクション内で実行
    const db2 = db as any
    await db2.exec('BEGIN TRANSACTION')

    try {
      for (const row of values) {
        const placeholders = columns.map(() => '?').join(', ')
        const query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
        await runQuery(db, query, row)
      }
      await db2.exec('COMMIT')
    } catch (error) {
      await db2.exec('ROLLBACK')
      throw error
    }
  }
}

// クエリ最適化: LIMIT句を使用して読み取り行数を削減
export async function getRecentAnalyses(db: DBConnection, limit: number = 100): Promise<any[]> {
  const query = `
    SELECT ca.*, c.novel_id, c.chunk_index
    FROM chunk_analyses ca
    JOIN chunks c ON ca.chunk_id = c.id
    ORDER BY ca.processed_at DESC
    LIMIT ?
  `

  return getAll(db, query, [limit])
}

// D1の10GBサイズ制限への対策: データベース分割の準備
export function getDatabaseForNovel(novelId: string): string {
  // 将来的に複数のD1データベースに分割する場合の準備
  // novelIdのハッシュ値に基づいてデータベースを選択
  const hash = novelId.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0)
  }, 0)

  const dbIndex = hash % 10 // 10個のデータベースに分散
  return `novel2manga-db-${dbIndex}`
}

// データベースの初期化（開発環境用）
export async function initializeDatabase() {
  if (process.env.NODE_ENV !== 'development') {
    return // 本番環境では初期化しない
  }

  const db = await getDevDatabase()

  try {
    // novelsテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS novels (
        id TEXT PRIMARY KEY,
        original_text_file TEXT NOT NULL,
        total_length INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // jobsテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        progress REAL DEFAULT 0,
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
      )
    `)

    // chunksテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_position INTEGER NOT NULL,
        end_position INTEGER NOT NULL,
        chunk_size INTEGER NOT NULL,
        overlap_size INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        UNIQUE(novel_id, chunk_index)
      )
    `)

    // chunk_analysesテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_analyses (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        analysis_file TEXT NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        character_count INTEGER DEFAULT 0,
        scene_count INTEGER DEFAULT 0,
        dialogue_count INTEGER DEFAULT 0,
        highlight_count INTEGER DEFAULT 0,
        situation_count INTEGER DEFAULT 0,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      )
    `)

    // novel_analysesテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS novel_analyses (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        analysis_file TEXT NOT NULL,
        total_characters INTEGER DEFAULT 0,
        total_scenes INTEGER DEFAULT 0,
        total_dialogues INTEGER DEFAULT 0,
        total_highlights INTEGER DEFAULT 0,
        total_situations INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE
      )
    `)

    // episodesテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS episodes (
        id TEXT PRIMARY KEY,
        novel_id TEXT NOT NULL,
        episode_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        chapters TEXT,
        climax_point INTEGER,
        start_index INTEGER NOT NULL,
        end_index INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
        UNIQUE(novel_id, episode_number)
      )
    `)

    // manga_pagesテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS manga_pages (
        id TEXT PRIMARY KEY,
        episode_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        layout_file TEXT NOT NULL,
        preview_image_file TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
        UNIQUE(episode_id, page_number)
      )
    `)

    // panelsテーブルの作成
    await db.exec(`
      CREATE TABLE IF NOT EXISTS panels (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        position_x INTEGER NOT NULL,
        position_y INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        panel_type TEXT NOT NULL CHECK (panel_type IN ('normal', 'action', 'emphasis')),
        content TEXT,
        reading_order INTEGER NOT NULL,
        FOREIGN KEY (page_id) REFERENCES manga_pages(id) ON DELETE CASCADE
      )
    `)

    // インデックスの作成（D1ベストプラクティス: パフォーマンス最適化）
    await db.exec(`
      -- 基本インデックス
      CREATE INDEX IF NOT EXISTS idx_jobs_novel_id ON jobs(novel_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_novel_id ON chunks(novel_id);
      CREATE INDEX IF NOT EXISTS idx_chunk_analyses_chunk_id ON chunk_analyses(chunk_id);
      CREATE INDEX IF NOT EXISTS idx_episodes_novel_id ON episodes(novel_id);
      CREATE INDEX IF NOT EXISTS idx_manga_pages_episode_id ON manga_pages(episode_id);
      CREATE INDEX IF NOT EXISTS idx_panels_page_id ON panels(page_id);
      
      -- パフォーマンス最適化のための複合インデックス
      CREATE INDEX IF NOT EXISTS idx_chunks_novel_id_index ON chunks(novel_id, chunk_index);
      CREATE INDEX IF NOT EXISTS idx_jobs_novel_id_status ON jobs(novel_id, status);
      CREATE INDEX IF NOT EXISTS idx_chunk_analyses_processed ON chunk_analyses(processed_at);
      CREATE INDEX IF NOT EXISTS idx_episodes_novel_id_number ON episodes(novel_id, episode_number);
      CREATE INDEX IF NOT EXISTS idx_manga_pages_episode_page ON manga_pages(episode_id, page_number);
    `)
  } finally {
    await db.close()
  }
}

// データベース接続を安全にクローズ
export async function closeDatabase(db: DBConnection) {
  if (!isD1Database(db)) {
    await (db as Database).close()
  }
  // D1の場合はクローズ不要
}
