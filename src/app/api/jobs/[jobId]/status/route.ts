import type { NextRequest } from 'next/server'
import { getLogger, runWithLogContext } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  return runWithLogContext({ muteConsole: true, route: 'api/jobs/[jobId]/status' }, async () => {
    const logger = getLogger().withContext({ route: 'api/jobs/[jobId]/status', method: 'GET' })
    try {
      const { jobId } = await ctx.params
      if (!jobId || jobId === 'undefined') {
        return createErrorResponse(new ValidationError('ジョブIDが指定されていません'))
      }

      const { job, chunks } = await getJobDetails(jobId)
      logger.info('Job status fetched', { jobId, status: job.status, chunks: chunks.length })
      // 成功レスポンスは { success: true, ... } のフラット形
      return createSuccessResponse({ job, chunks }, 200)
    } catch (error) {
      return createErrorResponse(error, 'ジョブステータスの取得に失敗しました')
    }
  })
}
