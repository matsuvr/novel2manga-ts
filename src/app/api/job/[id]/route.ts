import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { ValidationError } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const logger = getLogger().withContext({
      route: 'api/job/[id]',
      method: 'GET',
    })
    const id = params.id
    if (!id) {
      throw new ValidationError('ジョブIDが指定されていません')
    }

    const { job, chunks } = await getJobDetails(id)
    logger.info('Job details fetched', { id })
    return ApiResponder.success({ job, chunks })
  } catch (error) {
    return ApiResponder.error(error, 'Failed to get job details')
  }
}
