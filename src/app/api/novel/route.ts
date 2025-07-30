import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { text } = (await request.json()) as { text: unknown }

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'テキストが必要です' }, { status: 400 })
    }

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
      const errorData = (await response.json()) as { error?: string }
      return NextResponse.json(
        { error: errorData.error || '小説の保存に失敗しました' },
        { status: response.status },
      )
    }

    // uuidとファイル名をそれぞれD1に保存
    // レスポンスからデータを取得

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

    // DBに小説情報を保存（リトライ機能付き）
    let dbResponse: Response | null = null
    let dbData: { error?: string; job?: { id: string; type: string; status: string } } = {}
    const maxRetries = 3
    
    // デフォルトのチャンク設定を使用（実際のチャンク分割は後で行われる）
    const { getChunkingConfig } = await import('@/config')
    const chunkingConfig = getChunkingConfig()
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        dbResponse = await fetch(`${baseUrl}/api/novel/db`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uuid: data.uuid,
            fileName: data.fileName,
            length: data.length,
            totalChunks: 0, // チャンク分割前なので0
            chunkSize: chunkingConfig.defaultChunkSize,
            overlapSize: chunkingConfig.defaultOverlapSize,
          }),
        })

        dbData = (await dbResponse.json()) as {
          error?: string
          job?: { id: string; type: string; status: string }
        }
        
        if (dbResponse.ok) {
          // 成功したらループを抜ける
          break
        }
        
        // リトライ可能なエラーかチェック
        if (attempt < maxRetries) {
          console.warn(`DB保存エラー (試行 ${attempt}/${maxRetries}):`, {
            status: dbResponse.status,
            error: dbData.error,
            uuid: data.uuid,
            fileName: data.fileName
          })
          // 指数バックオフで待機
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
        }
      } catch (fetchError) {
        // ネットワークエラーなどの場合
        if (attempt < maxRetries) {
          console.warn(`DB接続エラー (試行 ${attempt}/${maxRetries}):`, {
            error: fetchError instanceof Error ? fetchError.message : String(fetchError),
            uuid: data.uuid,
            fileName: data.fileName
          })
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000))
        } else {
          dbData.error = fetchError instanceof Error ? fetchError.message : 'ネットワークエラー'
        }
      }
    }
    
    // 最終的に失敗した場合の詳細エラーログ
    if (!dbResponse || !dbResponse.ok) {
      console.error('DB保存失敗（全リトライ後）:', {
        totalAttempts: maxRetries,
        finalStatus: dbResponse?.status || 'no response',
        error: dbData.error || 'Unknown error',
        requestData: {
          uuid: data.uuid,
          fileName: data.fileName,
          length: data.length
        },
        timestamp: new Date().toISOString()
      })
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }

    return NextResponse.json({
      preview: data.preview || text.slice(0, 100),
      originalLength: text.length,
      fileName: data.fileName,
      uuid: data.uuid,
      message: '小説テキストを受信しました',
      job: dbData.job || null,
    })
  } catch (error) {
    console.error('小説アップロードAPIエラー:', {
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : error,
      timestamp: new Date().toISOString()
    })
    
    return NextResponse.json(
      { 
        error: 'サーバーエラーが発生しました',
        details: error instanceof Error ? error.message : '不明なエラー'
      },
      { status: 500 },
    )
  }
}
