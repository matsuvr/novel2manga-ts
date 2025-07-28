import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json() as { text: unknown }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    // 最初の50文字を返す
    const preview = text.substring(0, 50)
    // nove/storageのエンドポイントを利用して保存。エンドポイントが渡してきたファイル名を返す
    const baseUrl = request.nextUrl.origin
    const response = await fetch(`${baseUrl}/api/novel/storage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    // レスポンスのチェック
    if (!response.ok) {
      const errorData = await response.json() as { error?: string }
      return NextResponse.json(
        { error: errorData.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }

    // uuidとファイル名をそれぞれD1に保存
    // レスポンスからデータを取得

    const data = await response.json() as { error?: string; uuid?: string; fileName?: string; length?: number }
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }
    
    // DBに小説情報を保存
    const dbResponse = await fetch(`${baseUrl}/api/novel/db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uuid: data.uuid,
        fileName: data.fileName,
        length: data.length,
      }),
    })
    
    const dbData = await dbResponse.json() as { error?: string; job?: { id: string; type: string; status: string } }
    if (!dbResponse.ok) {
      console.error('DB保存エラー:', dbData.error)
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }
    
    return NextResponse.json({
      preview,
      originalLength: text.length,
      fileName: data.fileName,
      uuid: data.uuid,
      message: '小説テキストを受信しました',
      job: dbData.job || null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' + String(error) },
      { status: 500 },
    )
  }
}
