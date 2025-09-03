import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'

export async function GET(
  _request: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
) {
  try {
    const logger = getLogger().withContext({
      route: 'api/job/[id]',
      method: 'GET',
    })
    const { id } = await ctx.params
    if (!id) {
      throw new ValidationError('ジョブIDが指定されていません')
    }

    const { job, chunks } = await getJobDetails(id)
    logger.info('Job details fetched', { id })
    return createSuccessResponse({ job, chunks })
  } catch (error) {
    return createErrorResponse(error, 'Failed to get job details')
  }
}
