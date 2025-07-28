import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'

// 開発環境用のローカルストレージパス
const LOCAL_STORAGE_DIR = path.join(process.cwd(), '.local-storage', 'novels')

// ローカルストレージディレクトリの確認・作成
async function ensureStorageDir() {
  try {
    await fs.access(LOCAL_STORAGE_DIR)
  } catch {
    await fs.mkdir(LOCAL_STORAGE_DIR, { recursive: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json() as { text: unknown }
    
    // 文字列かどうかを確認
    if (typeof text !== 'string') {
      return NextResponse.json(
        { error: '入力は文字列である必要があります' },
        { status: 400 }
      )
    }
    
    if (text.length === 0) {
      return NextResponse.json(
        { error: 'テキストが空です' },
        { status: 400 }
      )
    }
    
    // UUIDを生成してファイル名を作成
    const uuid = randomUUID()
    const fileName = `novels/${uuid}.json`
    
    // 開発環境の場合はローカルファイルシステムを使用
    if (process.env.NODE_ENV === 'development') {
      await ensureStorageDir()
      const filePath = path.join(LOCAL_STORAGE_DIR, `${uuid}.json`)
      
      // メタデータとテキストを保存
      const fileData = {
        text,
        metadata: {
          uploadedAt: new Date().toISOString(),
          originalLength: text.length,
          fileName,
          uuid
        }
      }
      
      await fs.writeFile(filePath, JSON.stringify(fileData, null, 2), 'utf-8')
      
      return NextResponse.json({
        success: true,
        fileName,
        uuid,
        length: text.length,
        message: 'ファイルがローカルストレージに保存されました',
      })
    }
    
    // 本番環境：R2バケットに保存
    // @ts-expect-error - R2バインディングはランタイムで利用可能
    if (globalThis.NOVEL_STORAGE) {
      // @ts-expect-error - R2バインディングはランタイムで利用可能
      await globalThis.NOVEL_STORAGE.put(fileName, text, {
        httpMetadata: {
          contentType: 'text/plain; charset=utf-8',
        },
        customMetadata: {
          uploadedAt: new Date().toISOString(),
          originalLength: text.length.toString(),
        },
      })
      
      return NextResponse.json({
        success: true,
        fileName,
        uuid,
        length: text.length,
        message: 'ファイルがR2に保存されました',
      })
    } else {
      // R2が利用できない場合のフォールバック（通常は発生しないはず）
      return NextResponse.json(
        { error: 'ストレージが設定されていません' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('ファイル保存エラー:', error)
    return NextResponse.json(
      { error: 'ファイルの保存中にエラーが発生しました' },
      { status: 500 }
    )
  }
}

// ファイルを取得するGETエンドポイント
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get('uuid')
    
    if (!uuid) {
      return NextResponse.json(
        { error: 'UUIDが必要です' },
        { status: 400 }
      )
    }
    
    const fileName = `novels/${uuid}.json`
    
    // 開発環境の場合はローカルファイルシステムから読み込み
    if (process.env.NODE_ENV === 'development') {
      const filePath = path.join(LOCAL_STORAGE_DIR, `${uuid}.json`)
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8')
        const fileData = JSON.parse(fileContent)
        
        return NextResponse.json({
          text: fileData.text,
          uuid,
          fileName,
          metadata: fileData.metadata,
        })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return NextResponse.json(
            { error: 'ファイルが見つかりません' },
            { status: 404 }
          )
        }
        throw error
      }
    }
    
    // 本番環境：R2から取得
    // @ts-expect-error - R2バインディングはランタイムで利用可能
    if (globalThis.NOVEL_STORAGE) {
      // @ts-expect-error - R2バインディングはランタイムで利用可能
      const object = await globalThis.NOVEL_STORAGE.get(fileName)
      
      if (!object) {
        return NextResponse.json(
          { error: 'ファイルが見つかりません' },
          { status: 404 }
        )
      }
      
      const text = await object.text()
      const metadata = object.customMetadata || {}
      
      return NextResponse.json({
        text,
        uuid,
        fileName,
        metadata,
      })
    } else {
      return NextResponse.json(
        { error: 'ストレージが設定されていません' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('ファイル取得エラー:', error)
    return NextResponse.json(
      { error: 'ファイルの取得中にエラーが発生しました' },
      { status: 500 }
    )
  }
}