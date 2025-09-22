import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'
import { generateUUID } from '@/utils/uuid'

/**
 * Legacy singular endpoint POST /api/job used by fallback logic in some tests.
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  const logger = getLogger().withContext({ route: 'api/job', method: 'POST' })
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return createErrorResponse(new ValidationError('JSON の解析に失敗しました'))
    }
    const { novelId } = (body || {}) as { novelId?: unknown }
    if (typeof novelId !== 'string' || novelId.length === 0) {
      return createErrorResponse(new ValidationError('novelId が必要です'))
    }

    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      return createErrorResponse(new ValidationError('指定された小説が見つかりません'))
    }
    if (novel.userId && novel.userId !== user.id) {
      return createErrorResponse(new ValidationError('アクセス権限がありません'))
    }

    const jobId = await db.jobs().createJobRecord({
      id: generateUUID(),
      novelId,
      title: 'text_analysis',
      status: 'processing',
      userId: user.id,
    })
    logger.info('Legacy job created', { jobId, novelId })
    return createSuccessResponse({ data: { id: jobId, novelId } }, 201)
  } catch (error) {
    logger.error('Legacy job creation failed', { error })
    return createErrorResponse(error, 'ジョブの作成に失敗しました')
  }
})
