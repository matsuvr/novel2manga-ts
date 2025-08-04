import { randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { StorageFactory, StorageKeys } from '@/utils/storage'

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: unknown }

    // 文字列かどうかを確認
    if (typeof text !== 'string') {
      return NextResponse.json({ error: '入力は文字列である必要があります' }, { status: 400 })
    }

    if (text.length === 0) {
      return NextResponse.json({ error: 'テキストが空です' }, { status: 400 })
    }

    // UUIDを生成してファイル名を作成
    const uuid = randomUUID()
    const key = StorageKeys.novel(uuid)

    // ストレージに保存
    const storage = await StorageFactory.getNovelStorage()

    // メタデータとテキストを保存
    const fileData = {
      text,
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalLength: text.length,
        fileName: key,
        uuid,
      },
    }

    await storage.put(key, JSON.stringify(fileData), {
      uploadedAt: new Date().toISOString(),
      originalLength: text.length.toString(),
    })

    return NextResponse.json({
      success: true,
      fileName: key,
      uuid,
      length: text.length,
      message: 'ファイルが保存されました',
    })
  } catch (error) {
    console.error('ファイル保存エラー:', error)
    return NextResponse.json({ error: 'ファイルの保存中にエラーが発生しました' }, { status: 500 })
  }
}

// ファイルを取得するGETエンドポイント
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const uuid = searchParams.get('uuid')

    if (!uuid) {
      return NextResponse.json({ error: 'UUIDが必要です' }, { status: 400 })
    }

    const key = StorageKeys.novel(uuid)

    // ストレージから取得
    const storage = await StorageFactory.getNovelStorage()
    const result = await storage.get(key)

    if (!result) {
      return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 })
    }

    const fileData = JSON.parse(result.text)

    return NextResponse.json({
      text: fileData.text,
      uuid,
      fileName: key,
      metadata: fileData.metadata || result.metadata,
    })
  } catch (error) {
    console.error('ファイル取得エラー:', error)
    return NextResponse.json({ error: 'ファイルの取得中にエラーが発生しました' }, { status: 500 })
  }
}
