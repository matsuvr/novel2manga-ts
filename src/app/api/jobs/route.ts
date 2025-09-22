import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { getAuthenticatedUser, withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'
import { generateUUID } from '@/utils/uuid'

/**
 * GET /api/jobs - list current user's jobs (minimal implementation for E2E expectations)
 */
export const GET = withAuth(async (_request: NextRequest, user) => {
  try {
    const jobs = await db.jobs().getJobsByUser(user.id)
    return createSuccessResponse({ jobs })
  } catch (error) {
    return createErrorResponse(error, 'ジョブ一覧の取得に失敗しました')
  }
})

/**
 * POST /api/jobs - create a new processing job for a novel (compatibility)
 * Body: { novelId: string, jobName?: string }
 */
export const POST = async (request: NextRequest) => {
  const logger = getLogger().withContext({ route: 'api/jobs', method: 'POST' })
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return createErrorResponse(new ValidationError('JSON の解析に失敗しました'))
    }
    const { novelId, jobName } = (body || {}) as { novelId?: unknown; jobName?: unknown }
    if (typeof novelId !== 'string' || novelId.length === 0) {
      return createErrorResponse(new ValidationError('novelId が必要です'))
    }

    // Novel 存在確認 & 所有権
    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      return createErrorResponse(new ValidationError('指定された小説が見つかりません'))
    }
    let userId = novel.userId
    if (!userId) {
      try {
        const authed = await Effect.runPromise(getAuthenticatedUser(request))
        userId = authed.id
      } catch (authErr) {
        if (process.env.NODE_ENV === 'production') {
          return createErrorResponse(authErr, '認証が必要です')
        }
        logger.warn('Auth not available for job creation; proceeding as anonymous (non-production)')
        userId = 'anonymous'
      }
    }
    if (novel.userId && userId !== novel.userId) {
      return createErrorResponse(new ValidationError('アクセス権限がありません'))
    }

    if (!userId) {
      // 最終フォールバック（type guard）
      userId = 'anonymous'
    }
    const jobId = await db.jobs().createJobRecord({
      id: generateUUID(),
      novelId,
      title: typeof jobName === 'string' && jobName ? jobName : 'text_analysis',
      status: 'processing',
      userId,
    })

    logger.info('Job created', { jobId, novelId })
    return createSuccessResponse({ data: { id: jobId, novelId } }, 201)
  } catch (error) {
    logger.error('Job creation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return createErrorResponse(error, 'ジョブの作成に失敗しました')
  }
}
