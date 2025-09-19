import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'
import { saveNovelToStorage } from './storage/route'

export const POST = withAuth(async (request: NextRequest, user) => {
  const logger = getLogger().withContext({ api: 'novel/POST' })

  try {
    // Windows環境での文字化け対策：生のバイトデータを直接処理
    let body: unknown
    try {
      // 生のバイトデータを取得してUTF-8でデコード（request.json()を呼ばない）
      const buffer = await request.arrayBuffer()
      const rawText = new TextDecoder('utf-8').decode(buffer)
      body = JSON.parse(rawText)
    } catch (error) {
      logger.error('JSON parse error during novel upload', {
        error: error instanceof Error ? error.message : String(error),
        operation: 'json_parse',
      })
      return createErrorResponse(new ValidationError('無効なJSONが送信されました'))
    }

    const { text } = (body || {}) as { text: unknown }

    // デバッグ用：文字化け調査（最小限）
    logger.debug('Received text for novel processing', {
      textLength: typeof text === 'string' ? text.length : 'invalid',
      textType: typeof text,
    })

    if (typeof text !== 'string' || text.length === 0) {
      return createErrorResponse(new ValidationError('テキストが必要です'))
    }

    const data = await saveNovelToStorage(text)

    // DBに保存（ドメインサービス使用）
    try {
      await db.novels().ensureNovel(
        data.uuid,
        {
          title: `Novel ${data.uuid.slice(0, 8)}`,
          author: 'Unknown',
          originalTextPath: data.fileName,
          textLength: data.length,
          language: 'ja',
          metadataPath: null,
          userId: user.id,
        },
        {
          user: {
            id: user.id,
            name: user.name ?? undefined,
            email: user.email ?? undefined,
            image: user.image ?? undefined,
          },
        },
      )

      logger.info('Novel successfully saved to database', {
        novelId: data.uuid,
        operation: 'db_save',
      })
    } catch (dbError) {
      logger.error('Database save failed for novel', {
        novelId: data.uuid,
        error: dbError instanceof Error ? dbError.message : String(dbError),
        stack: dbError instanceof Error ? dbError.stack : undefined,
        operation: 'db_save',
      })
      // DBエラーがあってもストレージには保存されているので、処理は続行
    }

    return createSuccessResponse(
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
    getLogger()
      .withContext({ api: 'novel/POST' })
      .error('小説アップロードAPIエラー', {
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

    return createErrorResponse(
      error instanceof Error ? new ValidationError(error.message) : error,
      'サーバーエラーが発生しました',
    )
  }
})
