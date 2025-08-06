import crypto from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getApiConfig } from '@/config'

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: unknown }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    // nove/storageのエンドポイントを利用して保存。エンドポイントが渡してきたファイル名を返す
    const baseUrl = request.nextUrl.origin

    // タイムアウト付きでfetchを実行（10秒）
    const controller = new AbortController()
    const uploadTimeout = getApiConfig().timeout?.upload ?? 10000
    const timeoutId = setTimeout(() => controller.abort(), uploadTimeout)

    let response: Response
    try {
      response = await fetch(`${baseUrl}/api/novel/storage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error('小説storageエンドポイント呼び出しエラー:', fetchError)
      return NextResponse.json(
        {
          error: '小説の保存に失敗しました',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        },
        { status: 500 },
      )
    }
    clearTimeout(timeoutId)
    // レスポンスのチェック
    if (!response.ok) {
      const errorData = (await response.json()) as { error?: string }
      return NextResponse.json(
        { error: errorData.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }

    const data = (await response.json()) as {
      error?: string
      uuid?: string
      fileName?: string
      length?: number
      preview?: string
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }

    // DatabaseServiceを使用してDBに保存
    try {
      const { DatabaseService } = await import('@/services/database')

      const dbService = new DatabaseService()

      // 小説情報をDBに保存（UUIDを指定）
      await dbService.ensureNovel(data.uuid ?? crypto.randomUUID(), {
        title: `Novel ${(data.uuid ?? '').slice(0, 8) || 'Unknown'}`,
        author: 'Unknown',
        originalTextPath: data.fileName || '',
        textLength: data.length || 0,
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
