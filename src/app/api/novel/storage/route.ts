import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()
    
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
    const fileName = `novels/${uuid}.txt`
    
    // R2バケットに保存（ローカル開発時もMiniflareがエミュレート）
    // @ts-ignore - R2バインディングはランタイムで利用可能
    if (globalThis.NOVEL_STORAGE) {
      // @ts-ignore
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
    
    const fileName = `novels/${uuid}.txt`
    
    // @ts-ignore
    if (globalThis.NOVEL_STORAGE) {
      // @ts-ignore
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
