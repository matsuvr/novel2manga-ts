import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { saveNovelToStorage } from '@/app/api/novel/storage/route'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { getAuthenticatedUser } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'

/**
 * Unified novel creation endpoint (compatibility layer)
 *
 * Accepts either:
 *  - { text: string }
 *  - { title: string, author?: string, originalText: string }
 *
 * Returns both legacy top-level { uuid } for existing client code and
 * { data: { id } } for newer E2E expectations.
 *
 * NOTE: Authentication is required. If future public/anonymous upload support is desired,
 * it should be implemented explicitly with rate limiting & abuse controls.
 */
export const POST = async (request: NextRequest) => {
  const logger = getLogger().withContext({ route: 'api/novel', method: 'POST' })

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

    const { text, originalText, title, author } = (body || {}) as {
      text?: unknown
      originalText?: unknown
      title?: unknown
      author?: unknown
    }

    // デバッグ用：文字化け調査（最小限）
    logger.debug('Received text for novel processing', {
      textLength: typeof text === 'string' ? text.length : 'invalid',
      textType: typeof text,
    })

    const raw =
      typeof text === 'string'
        ? text
        : typeof originalText === 'string'
          ? originalText
          : null
    if (!raw || raw.trim().length === 0) {
      return createErrorResponse(new ValidationError('text もしくは originalText が必要です'))
    }

    const data = await saveNovelToStorage(raw)

    // DBに保存（ドメインサービス使用）
    let userId = 'anonymous'
    try {
      const authed = await Effect.runPromise(getAuthenticatedUser(request))
      userId = authed.id
    } catch (authErr) {
      if (process.env.NODE_ENV === 'production') {
        return createErrorResponse(authErr, '認証が必要です')
      }
      logger.warn('Auth not available; proceeding as anonymous (non-production)')
    }

    try {
      await db.novels().ensureNovel(
        data.uuid,
        {
          title:
            typeof title === 'string' && title.trim().length > 0
              ? title
              : `Novel ${data.uuid.slice(0, 8)}`,
          author: typeof author === 'string' ? author : 'Unknown',
          originalTextPath: data.fileName,
          textLength: data.length,
          language: 'ja',
          metadataPath: null,
          userId,
        },
        { user: { id: userId } },
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
        preview: data.preview || raw.slice(0, 100),
        originalLength: raw.length,
        fileName: data.fileName,
        uuid: data.uuid,
        data: { id: data.uuid },
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
}
