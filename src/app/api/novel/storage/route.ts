import { type NextRequest, NextResponse } from 'next/server'
import { StorageFactory } from '@/utils/storage'
import { generateUUID } from '@/utils/uuid'

export async function saveNovelToStorage(text: string) {
  const uuid = generateUUID()
  const key = `${uuid}.json`

  const storage = await StorageFactory.getNovelStorage()

  const fileData = {
    text,
    metadata: {
      uploadedAt: new Date().toISOString(),
      originalLength: text.length,
      uuid,
    },
  }

  await storage.put(key, JSON.stringify(fileData), {
    uuid,
    length: text.length.toString(),
  })

  return {
    uuid,
    fileName: `${uuid}.json`,
    length: text.length,
    preview: text.slice(0, 100),
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('[novel-storage] Starting storage operation')
    const startTime = Date.now()

    const { text } = (await request.json()) as { text?: unknown }

    // テスト期待: 文字列かつ非空を満たさない場合は同一メッセージ
    if (typeof text !== 'string' || text.length === 0) {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    const result = await saveNovelToStorage(text)

    const duration = Date.now() - startTime
    console.log(`[novel-storage] Storage completed in ${duration}ms`)

    return NextResponse.json({
      message: '小説が正常にアップロードされました',
      ...result,
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
