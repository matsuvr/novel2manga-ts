import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { JobService, JobServiceLive } from '@/services/job/service'
import { getAuthenticatedUser, withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'
import { generateUUID } from '@/utils/uuid'

/**
 * GET /api/jobs - list current user's jobs with pagination and filtering
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(100, Number(searchParams.get('limit') || '12')))
    const offset = Math.max(0, Number(searchParams.get('offset') || '0'))
    const status = searchParams.get('status') || undefined

    const getUserJobsEffect = Effect.gen(function* () {
      const jobService = yield* JobService
      return yield* jobService.getUserJobs(user.id, { limit, offset, status })
    })

    const jobsWithNovels = await Effect.runPromise(
      Effect.provide(getUserJobsEffect, JobServiceLive)
    )

    return createSuccessResponse({
      data: jobsWithNovels,
      metadata: {
        limit,
        offset,
        status,
        timestamp: new Date().toISOString(),
      },
    })
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
    // 最初に認証チェックを実行 - セキュリティ重要項目
    let userId: string
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

    // Novel 存在確認 & 所有権チェック
    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      return createErrorResponse(new ValidationError('指定された小説が見つかりません'))
    }

    // 既存の小説に所有者がいる場合は、認証済みユーザーと一致するかチェック
    if (novel.userId && novel.userId !== userId) {
      return createErrorResponse(new ValidationError('アクセス権限がありません'))
    }

    // Jobの所有者は認証済みユーザーまたは小説の既存所有者
    const jobOwnerId = novel.userId || userId

    const jobId = await db.jobs().createJobRecord({
      id: generateUUID(),
      novelId,
      title: typeof jobName === 'string' && jobName ? jobName : 'text_analysis',
      status: 'processing',
      userId: jobOwnerId,
    })

    logger.info('Job created', { jobId, novelId, jobOwnerId })
    return createSuccessResponse({ data: { id: jobId, novelId } }, 201)
  } catch (error) {
    logger.error('Job creation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return createErrorResponse(error, 'ジョブの作成に失敗しました')
  }
}
