import { randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getChunkingConfig } from '@/config'
import { splitTextIntoChunks } from '@/utils/chunk-splitter'
import { StorageFactory, StorageKeys } from '@/utils/storage'

interface RouteContext {
  params: { uuid: string }
}

// チャンク化リクエスト
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { uuid } = await params
    const body = (await request.json()) as { chunkSize?: unknown; overlapSize?: unknown }

    // 設定からデフォルト値を取得
    const chunkingConfig = getChunkingConfig()
    const chunkSize =
      typeof body.chunkSize === 'number' ? body.chunkSize : chunkingConfig.defaultChunkSize
    const overlapSize =
      typeof body.overlapSize === 'number' ? body.overlapSize : chunkingConfig.defaultOverlapSize

    // バリデーション（設定値も考慮）
    if (chunkSize < chunkingConfig.minChunkSize) {
      return NextResponse.json(
        { error: `チャンクサイズは${chunkingConfig.minChunkSize}以上である必要があります` },
        { status: 400 },
      )
    }

    if (chunkSize > chunkingConfig.maxChunkSize) {
      return NextResponse.json(
        { error: `チャンクサイズは${chunkingConfig.maxChunkSize}以下である必要があります` },
        { status: 400 },
      )
    }

    if (overlapSize < 0 || overlapSize >= chunkSize) {
      return NextResponse.json(
        { error: 'オーバーラップサイズは0以上かつチャンクサイズ未満である必要があります' },
        { status: 400 },
      )
    }

    const overlapRatio = overlapSize / chunkSize
    if (overlapRatio > chunkingConfig.maxOverlapRatio) {
      return NextResponse.json(
        { error: `オーバーラップ比率は${chunkingConfig.maxOverlapRatio}以下である必要があります` },
        { status: 400 },
      )
    }

    // データベースとストレージを取得
    const db = await StorageFactory.getDatabase()
    const novelStorage = await StorageFactory.getNovelStorage()
    const chunkStorage = await StorageFactory.getChunkStorage()

    try {
      // Novelの存在確認
      const novel = await db.get('SELECT * FROM novels WHERE id = ?', [uuid])

      if (!novel) {
        return NextResponse.json({ error: 'Novelが見つかりません' }, { status: 404 })
      }

      // 既存のチャンクを削除
      await db.run('DELETE FROM chunks WHERE novel_id = ?', [uuid])

      // ストレージから小説テキストを読み込み
      const novelData = await novelStorage.get(`${uuid}.json`)

      if (!novelData) {
        return NextResponse.json({ error: '小説ファイルが見つかりません' }, { status: 404 })
      }

      const fileData = JSON.parse(novelData.text)
      const text = fileData.text

      // テキストをチャンクに分割
      const chunks = splitTextIntoChunks(text, chunkSize, overlapSize)

      // チャンクを保存
      const chunkIds: string[] = []

      for (const chunk of chunks) {
        const chunkId = randomUUID()
        chunkIds.push(chunkId)

        // チャンクテキストをストレージに保存
        const chunkData = {
          novelId: uuid,
          chunkIndex: chunk.index,
          text: chunk.text,
          startPosition: chunk.startPosition,
          endPosition: chunk.endPosition,
        }

        await chunkStorage.put(StorageKeys.chunk(chunkId), JSON.stringify(chunkData))

        // チャンク情報をDBに保存
        await db.run(
          `INSERT INTO chunks (id, novel_id, chunk_index, start_position, end_position, chunk_size, overlap_size)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            chunkId,
            uuid,
            chunk.index,
            chunk.startPosition,
            chunk.endPosition,
            chunkSize,
            overlapSize,
          ],
        )
      }

      // NovelテーブルのtotalChunksを更新
      await db.run('UPDATE novels SET total_chunks = ? WHERE id = ?', [chunks.length, uuid])

      return NextResponse.json({
        success: true,
        novelId: uuid,
        totalChunks: chunks.length,
        chunkSize,
        overlapSize,
        chunkIds,
      })
    } finally {
      await db.close()
    }
  } catch (error) {
    console.error('チャンク化エラー:', error)
    return NextResponse.json({ error: 'チャンク化中にエラーが発生しました' }, { status: 500 })
  }
}

// チャンク情報を取得
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { uuid } = await params

    // データベースを取得
    const db = await StorageFactory.getDatabase()

    try {
      // チャンク情報を取得
      const chunks = await db.all(`SELECT * FROM chunks WHERE novel_id = ? ORDER BY chunk_index`, [
        uuid,
      ])

      if (chunks.length === 0) {
        return NextResponse.json({ error: 'チャンクが見つかりません' }, { status: 404 })
      }

      return NextResponse.json({
        novelId: uuid,
        totalChunks: chunks.length,
        chunks: chunks.map((chunk: any) => ({
          id: chunk.id,
          index: chunk.chunk_index,
          startPosition: chunk.start_position,
          endPosition: chunk.end_position,
          chunkSize: chunk.chunk_size,
          overlapSize: chunk.overlap_size,
          createdAt: chunk.created_at,
        })),
      })
    } finally {
      await db.close()
    }
  } catch (error) {
    console.error('チャンク取得エラー:', error)
    return NextResponse.json(
      { error: 'チャンク情報の取得中にエラーが発生しました' },
      { status: 500 },
    )
  }
}
