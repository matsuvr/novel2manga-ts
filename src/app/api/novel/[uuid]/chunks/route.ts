import { NextRequest, NextResponse } from 'next/server'
import sqlite3 from 'sqlite3'
import { open } from 'sqlite'
import path from 'path'
import fs from 'fs/promises'
import { splitTextIntoChunks } from '@/utils/chunk-splitter'
import { getChunkingConfig, isDevelopment } from '@/config'

// ストレージ設定から取得
const DB_PATH = path.join(process.cwd(), '.local-storage', 'novel2manga.db')
const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.local-storage', 'novels')
const CHUNKS_DIR = path.join(process.cwd(), '.local-storage', 'chunks')

// データベース接続を取得
async function getDatabase() {
  return open({
    filename: DB_PATH,
    driver: sqlite3.Database
  })
}

// ローカルストレージディレクトリの確認・作成
async function ensureChunksDir() {
  try {
    await fs.access(CHUNKS_DIR)
  } catch {
    await fs.mkdir(CHUNKS_DIR, { recursive: true })
  }
}

interface RouteContext {
  params: { uuid: string }
}

// チャンク化リクエスト
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { uuid } = params
    const body = await request.json() as { chunkSize?: unknown; overlapSize?: unknown }
    
    // 設定からデフォルト値を取得
    const chunkingConfig = getChunkingConfig()
    const chunkSize = typeof body.chunkSize === 'number' ? body.chunkSize : chunkingConfig.defaultChunkSize
    const overlapSize = typeof body.overlapSize === 'number' ? body.overlapSize : chunkingConfig.defaultOverlapSize
    
    // バリデーション（設定値も考慮）
    if (chunkSize < chunkingConfig.minChunkSize) {
      return NextResponse.json(
        { error: `チャンクサイズは${chunkingConfig.minChunkSize}以上である必要があります` },
        { status: 400 }
      )
    }
    
    if (chunkSize > chunkingConfig.maxChunkSize) {
      return NextResponse.json(
        { error: `チャンクサイズは${chunkingConfig.maxChunkSize}以下である必要があります` },
        { status: 400 }
      )
    }
    
    if (overlapSize < 0 || overlapSize >= chunkSize) {
      return NextResponse.json(
        { error: 'オーバーラップサイズは0以上かつチャンクサイズ未満である必要があります' },
        { status: 400 }
      )
    }
    
    const overlapRatio = overlapSize / chunkSize
    if (overlapRatio > chunkingConfig.maxOverlapRatio) {
      return NextResponse.json(
        { error: `オーバーラップ比率は${chunkingConfig.maxOverlapRatio}以下である必要があります` },
        { status: 400 }
      )
    }
    
    // 開発環境の場合
    if (isDevelopment()) {
      const db = await getDatabase()
      
      try {
        // Novelの存在確認
        const novel = await db.get(
          'SELECT * FROM novels WHERE id = ?',
          [uuid]
        )
        
        if (!novel) {
          await db.close()
          return NextResponse.json(
            { error: 'Novelが見つかりません' },
            { status: 404 }
          )
        }
        
        // 既存のチャンクを削除
        await db.run(
          'DELETE FROM chunks WHERE novel_id = ?',
          [uuid]
        )
        
        // ローカルストレージから小説テキストを読み込み
        const filePath = path.join(LOCAL_STORAGE_DIR, `${uuid}.json`)
        const fileContent = await fs.readFile(filePath, 'utf-8')
        const fileData = JSON.parse(fileContent)
        const text = fileData.text
        
        // テキストをチャンクに分割
        const chunks = splitTextIntoChunks(text, chunkSize, overlapSize)
        
        // チャンクを保存
        await ensureChunksDir()
        const chunkIds: string[] = []
        
        for (const chunk of chunks) {
          const chunkId = crypto.randomUUID()
          chunkIds.push(chunkId)
          
          // チャンクテキストをファイルに保存
          const chunkFilePath = path.join(CHUNKS_DIR, `${chunkId}.json`)
          await fs.writeFile(chunkFilePath, JSON.stringify({
            novelId: uuid,
            chunkIndex: chunk.index,
            text: chunk.text,
            startPosition: chunk.startPosition,
            endPosition: chunk.endPosition
          }, null, 2), 'utf-8')
          
          // チャンク情報をDBに保存
          await db.run(
            `INSERT INTO chunks (id, novel_id, chunk_index, start_position, end_position, chunk_size, overlap_size)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [chunkId, uuid, chunk.index, chunk.startPosition, chunk.endPosition, chunkSize, overlapSize]
          )
        }
        
        await db.close()
        
        return NextResponse.json({
          success: true,
          novelId: uuid,
          totalChunks: chunks.length,
          chunkSize,
          overlapSize,
          chunkIds
        })
        
      } catch (error) {
        await db.close()
        throw error
      }
    }
    
    // 本番環境：R2とD1を使用
    // @ts-expect-error - D1バインディングはランタイムで利用可能
    if (globalThis.DB && globalThis.NOVEL_STORAGE && globalThis.CHUNKS_STORAGE) {
      // @ts-expect-error - D1バインディングはランタイムで利用可能
      const db = globalThis.DB
      // @ts-expect-error - R2バインディングはランタイムで利用可能
      const novelStorage = globalThis.NOVEL_STORAGE
      // @ts-expect-error - R2バインディングはランタイムで利用可能
      const chunksStorage = globalThis.CHUNKS_STORAGE
      
      // Novelの存在確認
      const novel = await db.prepare(
        'SELECT * FROM novels WHERE id = ?'
      ).bind(uuid).first()
      
      if (!novel) {
        return NextResponse.json(
          { error: 'Novelが見つかりません' },
          { status: 404 }
        )
      }
      
      // 既存のチャンクを削除
      await db.prepare(
        'DELETE FROM chunks WHERE novel_id = ?'
      ).bind(uuid).run()
      
      // R2から小説テキストを取得
      const fileName = `novels/${uuid}.json`
      const object = await novelStorage.get(fileName)
      
      if (!object) {
        return NextResponse.json(
          { error: '小説ファイルが見つかりません' },
          { status: 404 }
        )
      }
      
      const fileContent = await object.text()
      const fileData = JSON.parse(fileContent)
      const text = fileData.text
      
      // テキストをチャンクに分割
      const chunks = splitTextIntoChunks(text, chunkSize, overlapSize)
      
      // チャンクを保存
      const chunkIds: string[] = []
      
      for (const chunk of chunks) {
        const chunkId = crypto.randomUUID()
        chunkIds.push(chunkId)
        
        // チャンクテキストをR2に保存
        const chunkFileName = `chunks/${chunkId}.json`
        await chunksStorage.put(chunkFileName, JSON.stringify({
          novelId: uuid,
          chunkIndex: chunk.index,
          text: chunk.text,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition
        }), {
          httpMetadata: {
            contentType: 'application/json; charset=utf-8',
          }
        })
        
        // チャンク情報をD1に保存
        await db.prepare(
          `INSERT INTO chunks (id, novel_id, chunk_index, start_position, end_position, chunk_size, overlap_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind(chunkId, uuid, chunk.index, chunk.startPosition, chunk.endPosition, chunkSize, overlapSize).run()
      }
      
      return NextResponse.json({
        success: true,
        novelId: uuid,
        totalChunks: chunks.length,
        chunkSize,
        overlapSize,
        chunkIds
      })
    }
    
    return NextResponse.json(
      { error: 'ストレージが設定されていません' },
      { status: 500 }
    )
    
  } catch (error) {
    console.error('チャンク化エラー:', error)
    return NextResponse.json(
      { error: 'チャンク化中にエラーが発生しました' },
      { status: 500 }
    )
  }
}

// チャンク情報を取得
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { uuid } = params
    
    // 開発環境の場合
    if (isDevelopment()) {
      const db = await getDatabase()
      
      try {
        // チャンク情報を取得
        const chunks = await db.all(
          `SELECT * FROM chunks WHERE novel_id = ? ORDER BY chunk_index`,
          [uuid]
        )
        
        if (chunks.length === 0) {
          await db.close()
          return NextResponse.json(
            { error: 'チャンクが見つかりません' },
            { status: 404 }
          )
        }
        
        await db.close()
        
        return NextResponse.json({
          novelId: uuid,
          totalChunks: chunks.length,
          chunks: chunks.map(chunk => ({
            id: chunk.id,
            index: chunk.chunk_index,
            startPosition: chunk.start_position,
            endPosition: chunk.end_position,
            chunkSize: chunk.chunk_size,
            overlapSize: chunk.overlap_size,
            createdAt: chunk.created_at
          }))
        })
        
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
      
      const result = await db.prepare(
        'SELECT * FROM chunks WHERE novel_id = ? ORDER BY chunk_index'
      ).bind(uuid).all()
      
      if (!result.results || result.results.length === 0) {
        return NextResponse.json(
          { error: 'チャンクが見つかりません' },
          { status: 404 }
        )
      }
      
      return NextResponse.json({
        novelId: uuid,
        totalChunks: result.results.length,
        chunks: result.results.map((chunk: any) => ({
          id: chunk.id,
          index: chunk.chunk_index,
          startPosition: chunk.start_position,
          endPosition: chunk.end_position,
          chunkSize: chunk.chunk_size,
          overlapSize: chunk.overlap_size,
          createdAt: chunk.created_at
        }))
      })
    }
    
    return NextResponse.json(
      { error: 'データベースが設定されていません' },
      { status: 500 }
    )
    
  } catch (error) {
    console.error('チャンク取得エラー:', error)
    return NextResponse.json(
      { error: 'チャンク情報の取得中にエラーが発生しました' },
      { status: 500 }
    )
  }
}