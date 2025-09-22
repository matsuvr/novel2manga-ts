import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { JobResumeService } from '@/services/application/job-resume-service'
import { db } from '@/services/database'
import { getAuthenticatedUser } from '@/utils/api-auth'
import {
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/utils/api-error'

const resumeRequestSchema = z.object({
  novelId: z.string().uuid(),
})

export const POST = async (request: NextRequest) => {
  const _logger = getLogger().withContext({
    route: 'api/resume',
    method: 'POST',
  })

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
      _logger.warn('Auth not available; proceeding as anonymous for resume (non-production)')
      userId = 'anonymous'
    }

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return createErrorResponse(new ValidationError('無効なJSONが送信されました'))
    }

    const parsed = resumeRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return createErrorResponse(
        new ValidationError('リクエストボディが無効です', undefined, {
          issues: parsed.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        }),
      )
    }

    const { novelId } = parsed.data
    _logger.info('Resume request received', { novelId })

    // 小説の存在確認と所有権チェック
    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      return createErrorResponse(new NotFoundError('指定された小説が見つかりません'))
    }

    // 小説に所有者がいる場合は、認証済みユーザーと一致するかチェック
    if (novel.userId && novel.userId !== userId) {
      return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
    }

    const resumeService = new JobResumeService()
    const result = await resumeService.resumeByNovelId(novelId)

    return createSuccessResponse({
      success: result.success,
      jobId: result.jobId,
      novelId: result.novelId,
      message: result.message,
      status: result.status,
      resumePoint: result.resumePoint,
    })
  } catch (error) {
    _logger.error('Resume request failed', {
      error: extractErrorMessage(error),
    })
    return createErrorResponse(error, 'ジョブの再開中にエラーが発生しました')
  }
}
