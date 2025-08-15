import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getDatabaseService } from '@/services/db-factory'
import { ApiResponder } from '@/utils/api-responder'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params
    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/token-usage',
      method: 'GET',
      jobId,
    })

    logger.info('Fetching token usage for job')

    const db = getDatabaseService()
    const usageRecords = await db.getTokenUsageByJobId(jobId)

    logger.info('Token usage fetched', { count: usageRecords.length })

    return ApiResponder.success({
      jobId,
      tokenUsage: usageRecords,
      summary: {
        totalRecords: usageRecords.length,
        totalTokens: usageRecords.reduce((sum, record) => sum + record.totalTokens, 0),
        totalCost: usageRecords.reduce((sum, record) => sum + (record.cost || 0), 0),
        providers: Array.from(new Set(usageRecords.map((record) => record.provider))),
      },
    })
  } catch (error) {
    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/token-usage',
      method: 'GET',
    })
    logger.error('Error fetching token usage', {
      error: error instanceof Error ? error.message : String(error),
    })
    return ApiResponder.error(error, 'Failed to fetch token usage')
  }
}
