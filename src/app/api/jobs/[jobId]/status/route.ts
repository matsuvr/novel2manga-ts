import type { NextRequest } from 'next/server'
import { getLogger, runWithLogContext } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
  NotFoundError,
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
          // Use generic resource name so NotFoundError formats message as 'ジョブが見つかりません'
          return createErrorResponse(new NotFoundError('ジョブ'))
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
        return createErrorResponse(error, 'ジョブステータスの取得に失敗しました')
      }
    })
  },
)
