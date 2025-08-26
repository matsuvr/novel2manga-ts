import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { JobResumeService } from '@/services/application/job-resume-service'
import { extractErrorMessage } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'

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
      return ApiResponder.validation('無効なJSONが送信されました')
    }

    const parsed = resumeRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return ApiResponder.validation('リクエストボディが無効です', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    const { novelId } = parsed.data
    _logger.info('Resume request received', { novelId })

    const resumeService = new JobResumeService()
    const result = await resumeService.resumeByNovelId(novelId)

    return ApiResponder.success({
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
    return ApiResponder.error(error, 'ジョブの再開中にエラーが発生しました')
  }
}
