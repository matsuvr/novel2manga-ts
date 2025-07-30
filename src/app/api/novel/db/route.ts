import { NextRequest, NextResponse } from 'next/server'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'

// 開発環境用のSQLiteデータベースパス
const DB_PATH = path.join(process.cwd(), '.local-storage', 'novel2manga.db')

// データベース接続を取得
async function getDatabase() {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  })
}

// データベースの初期化（開発環境用）
async function initializeDatabase() {
  const db = await getDatabase()
  
  // novelsテーブルの作成
  await db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id TEXT PRIMARY KEY,
      original_text_file TEXT NOT NULL,
      total_length INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      chunk_size INTEGER NOT NULL,
      overlap_size INTEGER NOT NULL,
      total_episodes INTEGER,
      total_pages INTEGER,
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
  
  await db.close()
}

// Novel要素を保存
export async function POST(request: NextRequest) {
  try {
    const { uuid, fileName, length, totalChunks, chunkSize, overlapSize } = await request.json() as { 
      uuid: unknown; 
      fileName: unknown; 
      length: unknown;
      totalChunks: unknown;
      chunkSize: unknown;
      overlapSize: unknown;
    }
    
    // バリデーション
    if (!uuid || !fileName || typeof length !== 'number' || 
        typeof totalChunks !== 'number' || typeof chunkSize !== 'number' || 
        typeof overlapSize !== 'number') {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
        { status: 400 }
      )
    }
    
    // 開発環境の場合
    if (process.env.NODE_ENV === 'development') {
      await initializeDatabase()
      const db = await getDatabase()
      
      try {
        // Novel要素をデータベースに挿入
        await db.run(
          `INSERT INTO novels (id, original_text_file, total_length, total_chunks, chunk_size, overlap_size) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuid, fileName, length, totalChunks, chunkSize, overlapSize]
        )
        
        // 処理ジョブも同時に作成
        const jobId = crypto.randomUUID()
        await db.run(
          `INSERT INTO jobs (id, novel_id, type, status) 
           VALUES (?, ?, 'text_analysis', 'pending')`,
          [jobId, uuid]
        )
        
        const result = {
          success: true,
          novel: {
            id: uuid,
            originalTextFile: fileName,
            totalLength: length,
            totalChunks: totalChunks,
            chunkSize: chunkSize,
            overlapSize: overlapSize
          },
          job: {
            id: jobId,
            type: 'text_analysis',
            status: 'pending'
          }
        }
        
        await db.close()
        return NextResponse.json(result)
        
      } catch (error) {
        await db.close()
        throw error
      }
    }
    
    // 本番環境：D1を使用
    // @ts-expect-error - D1バインディングはランタイムで利用可能
    if (globalThis.DB) {
      // @ts-expect-error - D1バインディングはランタイムで利用可能
      const db = globalThis.DB
      
      // Novel要素をD1に挿入
      await db.prepare(
        `INSERT INTO novels (id, original_text_file, total_length, total_chunks, chunk_size, overlap_size) 
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(uuid, fileName, length, totalChunks, chunkSize, overlapSize).run()
      
      // 処理ジョブも同時に作成
      const jobId = crypto.randomUUID()
      await db.prepare(
        `INSERT INTO jobs (id, novel_id, type, status) 
         VALUES (?, ?, 'text_analysis', 'pending')`
      ).bind(jobId, uuid).run()
      
      return NextResponse.json({
        success: true,
        novel: {
          id: uuid,
          originalTextFile: fileName,
          totalLength: length,
          totalChunks: totalChunks,
          chunkSize: chunkSize,
          overlapSize: overlapSize
        },
        job: {
          id: jobId,
          type: 'text_analysis',
          status: 'pending'
        }
      })
    }
    
    return NextResponse.json(
      { error: 'データベースが設定されていません' },
      { status: 500 }
    )
    
  } catch (error) {
    console.error('Novel保存エラー:', error)
    return NextResponse.json(
      { error: 'Novelの保存中にエラーが発生しました' },
      { status: 500 }
    )
  }
}

// Novel一覧を取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    
    // 開発環境の場合
    if (process.env.NODE_ENV === 'development') {
      await initializeDatabase()
      const db = await getDatabase()
      
      try {
        if (id) {
          // 特定のNovelを取得
          const novel = await db.get(
            `SELECT * FROM novels WHERE id = ?`,
            [id]
          )
          
          if (!novel) {
            await db.close()
            return NextResponse.json(
              { error: 'Novelが見つかりません' },
              { status: 404 }
            )
          }
          
          // 関連するジョブも取得
          const jobs = await db.all(
            `SELECT * FROM jobs WHERE novel_id = ? ORDER BY created_at DESC`,
            [id]
          )
          
          await db.close()
          return NextResponse.json({ novel, jobs })
        } else {
          // 全てのNovelを取得
          const novels = await db.all(
            `SELECT * FROM novels ORDER BY created_at DESC`
          )
          
          await db.close()
          return NextResponse.json({ novels })
        }
      } catch (error) {
        await db.close()
        throw error
      }
    }
    
    // 本番環境：D1を使用
    // @ts-expect-error - D1バインディングはランタイムで利用可能
    if (globalThis.DB) {
      // @ts-expect-error - D1バインディングはランタイムで利用可能
      const db = globalThis.DB
      
      if (id) {
        const novel = await db.prepare(
          `SELECT * FROM novels WHERE id = ?`
        ).bind(id).first()
        
        if (!novel) {
          return NextResponse.json(
            { error: 'Novelが見つかりません' },
            { status: 404 }
          )
        }
        
        const jobs = await db.prepare(
          `SELECT * FROM jobs WHERE novel_id = ? ORDER BY created_at DESC`
        ).bind(id).all()
        
        return NextResponse.json({ novel, jobs: jobs.results })
      } else {
        const result = await db.prepare(
          `SELECT * FROM novels ORDER BY created_at DESC`
        ).all()
        
        return NextResponse.json({ novels: result.results })
      }
    }
    
    return NextResponse.json(
      { error: 'データベースが設定されていません' },
      { status: 500 }
    )
    
  } catch (error) {
    console.error('Novel取得エラー:', error)
    return NextResponse.json(
      { error: 'Novelの取得中にエラーが発生しました' },
      { status: 500 }
    )
  }
}