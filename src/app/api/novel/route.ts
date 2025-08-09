import { type NextRequest, NextResponse } from 'next/server'
import { saveNovelToStorage } from './storage/route'

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: unknown }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    const data = await saveNovelToStorage(text)

    // DatabaseServiceを使用してDBに保存
    try {
      const { DatabaseService } = await import('@/services/database')

      const dbService = new DatabaseService()

      // 小説情報をDBに保存（UUIDを指定）
      await dbService.ensureNovel(data.uuid, {
        title: `Novel ${data.uuid.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: data.fileName,
        textLength: data.length,
        language: 'ja',
      })

      console.log(`✓ 小説をDBに保存: ${data.uuid}`)
    } catch (dbError) {
      console.error('DB保存エラー:', dbError)
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }

    return NextResponse.json({
      preview: data.preview || text.slice(0, 100),
      originalLength: text.length,
      fileName: data.fileName,
      uuid: data.uuid,
      message: '小説テキストを受信しました',
    })
  } catch (error) {
    console.error('小説アップロードAPIエラー:', {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json(
      {
        error: 'サーバーエラーが発生しました',
        details: error instanceof Error ? error.message : '不明なエラー',
      },
      { status: 500 },
    )
  }
}
