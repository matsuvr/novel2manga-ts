import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { JobResumeService } from '@/services/application/job-resume-service'
import {
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
  ValidationError,
} from '@/utils/api-error'

const resumeRequestSchema = z.object({
  novelId: z.string().uuid(),
})

export async function POST(request: NextRequest) {
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
