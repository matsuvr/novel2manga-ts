import type { NextRequest } from 'next/server'
export const runtime = 'nodejs'

import { adaptAll } from '@/repositories/adapters'
import { NovelRepository } from '@/repositories/novel-repository'
import { getDatabaseService } from '@/services/db-factory'
import { ValidationError } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'
import { saveNovelToStorage } from './storage/route'

export async function POST(request: NextRequest) {
  try {
    // Windows環境での文字化け対策：生のバイトデータを直接処理
    let body: unknown
    try {
      // 生のバイトデータを取得してUTF-8でデコード（request.json()を呼ばない）
      const buffer = await request.arrayBuffer()
      const rawText = new TextDecoder('utf-8').decode(buffer)
      body = JSON.parse(rawText)
    } catch (error) {
      console.log(
        '[DEBUG] JSON parse error:',
        error instanceof Error ? error.message : String(error),
      )
      return ApiResponder.validation('無効なJSONが送信されました')
    }

    const { text } = (body || {}) as { text: unknown }

    // デバッグ用：文字化け調査（最小限）
    console.log('[DEBUG] Received text:', text)

    if (typeof text !== 'string' || text.length === 0) {
      return ApiResponder.validation('テキストが必要です')
    }

    const data = await saveNovelToStorage(text)

    // Repositoryを使用してDBに保存
    try {
      const dbService = getDatabaseService()
      const { novel: novelPort } = adaptAll(dbService)
      const novelRepo = new NovelRepository(novelPort)

      // 小説情報をDBに保存（UUIDを指定）
      await novelRepo.ensure(data.uuid, {
        title: `Novel ${data.uuid.slice(0, 8)}`,
        author: 'Unknown',
        originalTextPath: data.fileName,
        textLength: data.length,
        language: 'ja',
        metadataPath: null,
      })

      console.log(`✓ 小説をDBに保存: ${data.uuid}`)
    } catch (dbError) {
      console.error('DB保存エラー:', dbError)
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }

    return ApiResponder.success(
      {
        preview: data.preview || text.slice(0, 100),
        originalLength: text.length,
        fileName: data.fileName,
        uuid: data.uuid,
        message: '小説が正常に保存されました',
      },
      201,
    )
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

    return ApiResponder.error(
      error instanceof Error ? new ValidationError(error.message) : error,
      'サーバーエラーが発生しました',
    )
  }
}
