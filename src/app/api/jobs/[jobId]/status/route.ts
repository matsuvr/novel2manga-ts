import type { NextRequest } from 'next/server'
import { ApiResponder } from '@/utils/api-responder'
import { getLogger } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  const logger = getLogger().withContext({ route: 'api/jobs/[jobId]/status', method: 'GET' })
  try {
    const { jobId } = await ctx.params
    if (!jobId || jobId === 'undefined') {
      return ApiResponder.validation('ジョブIDが指定されていません')
    }

    const { job, chunks } = await getJobDetails(jobId)
    logger.info('Job status fetched', { jobId, status: job.status, chunks: chunks.length })
    // ApiResponder.success は { success: true, ... } のフラット形で返す
    return ApiResponder.success({ job, chunks }, 200)
  } catch (error) {
    // ApiResponder.error は NotFound/Validation 等を適切なHTTPステータスとボディで返す
    return ApiResponder.error(error, 'ジョブステータスの取得に失敗しました')
  }
}
