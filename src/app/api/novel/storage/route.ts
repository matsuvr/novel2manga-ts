import { randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { StorageFactory } from '@/utils/storage'

export async function POST(request: NextRequest) {
  try {
    console.log('[novel-storage] Starting storage operation')
    const startTime = Date.now()

    const { text } = (await request.json()) as { text?: unknown }

    // テスト期待: 文字列かつ非空を満たさない場合は同一メッセージ
    if (typeof text !== 'string' || text.length === 0) {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    // UUIDを生成してファイル名を作成
    const uuid = randomUUID()
    const key = `${uuid}.json`

    // ストレージに保存（軽量化）
    const storage = await StorageFactory.getNovelStorage()

    // シンプルなファイルデータ構造（軽量化）
    const fileData = {
      text,
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalLength: text.length,
        uuid,
      },
    }

    // 軽量メタデータで保存
    await storage.put(key, JSON.stringify(fileData), {
      uuid,
      length: text.length.toString(),
    })

    const duration = Date.now() - startTime
    console.log(`[novel-storage] Storage completed in ${duration}ms`)

    return NextResponse.json({
      message: '小説が正常にアップロードされました',
      uuid,
      fileName: `${uuid}.json`,
      length: text.length,
      preview: text.slice(0, 100),
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

    const key = `${uuid}.json`

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
      fileName: `${uuid}.json`,
      metadata: fileData.metadata || result.metadata,
    })
  } catch (error) {
    console.error('ファイル取得エラー:', error)
    return NextResponse.json({ error: 'ファイルの取得中にエラーが発生しました' }, { status: 500 })
  }
}
