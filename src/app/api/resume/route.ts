import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { JobResumeService } from '@/services/application/job-resume-service'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
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

export const POST = withAuth(async (request: NextRequest, user) => {
  const _logger = getLogger().withContext({
    route: 'api/resume',
    method: 'POST',
  })

  try {
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

    // ユーザー所有権チェック
    const novel = await db.novels().getNovel(novelId)
    if (!novel) {
      return createErrorResponse(new NotFoundError('指定された小説が見つかりません'))
    }
    if (novel.userId && novel.userId !== user.id) {
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
})
