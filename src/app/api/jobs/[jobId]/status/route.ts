import type { NextRequest } from 'next/server'
import { getLogger, runWithLogContext } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  ForbiddenError,
  ValidationError,
} from '@/utils/api-error'

export const GET = withAuth(
  async (
    _request: NextRequest,
    user,
    ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
  ) => {
    return runWithLogContext({ muteConsole: true, route: 'api/jobs/[jobId]/status' }, async () => {
      const logger = getLogger().withContext({ route: 'api/jobs/[jobId]/status', method: 'GET' })
      try {
        const { jobId } = await ctx.params
        if (!jobId || jobId === 'undefined') {
          return createErrorResponse(new ValidationError('ジョブIDが指定されていません'))
        }

        // ユーザー所有権チェック
        const job = await db.jobs().getJob(jobId)
        if (!job) {
          return createErrorResponse(
            new ApiError('Job not found', 404, ERROR_CODES.NOT_FOUND, { jobId }),
          )
        }
        if (job.userId && job.userId !== user.id) {
          return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
        }

        const { job: jobDetails, chunks } = await getJobDetails(jobId)
        logger.info('Job status fetched', {
          jobId,
          status: jobDetails.status,
          chunks: chunks.length,
        })
        // 成功レスポンスは { success: true, ... } のフラット形
        return createSuccessResponse({ job: jobDetails, chunks }, 200)
      } catch (error) {
        if (error instanceof ApiError) {
          return createErrorResponse(error, 'Failed to fetch job status')
        }

        const details = error instanceof Error ? error.message : String(error)
        return createErrorResponse(
          new ApiError('Failed to fetch job status', 500, ERROR_CODES.INTERNAL_ERROR, details),
          'Failed to fetch job status',
        )
      }
    })
  },
)
