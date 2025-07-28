import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

    // 最初の50文字を返す
    const preview = text.substring(0, 50)
    // nove/storageのエンドポイントを利用して保存。エンドポイントが渡してきたファイル名を返す
    const response = await fetch('http://localhost:3000/api/novel/storage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    })
    // レスポンスのチェック
    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.json(
        { error: errorData.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }

    // uuidとファイル名をそれぞれD1に保存
    // レスポンスからデータを取得

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }
    return NextResponse.json({
      preview,
      originalLength: text.length,
      fileName: data.fileName,
      uuid: data.uuid,
      message: '小説テキストを受信しました',
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' + String(error) },
      { status: 500 },
    )
  }
}
