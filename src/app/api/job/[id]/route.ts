import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import { createErrorResponse, createSuccessResponse, ValidationError } from '@/utils/api-error'

export const GET = withAuth(
  async (
    _request: NextRequest,
    user,
    ctx: { params: { id: string } | Promise<{ id: string }> },
  ) => {
    try {
      const logger = getLogger().withContext({
        route: 'api/job/[id]',
        method: 'GET',
      })
      const { id } = await ctx.params
      if (!id) {
        throw new ValidationError('ジョブIDが指定されていません')
      }

      // ユーザー所有権チェック
      const job = await db.jobs().getJob(id)
      if (!job) {
        throw new ValidationError('指定されたジョブが見つかりません')
      }
      if (job.userId && job.userId !== user.id) {
        throw new ValidationError('アクセス権限がありません')
      }

      const { job: jobDetails, chunks } = await getJobDetails(id)
      logger.info('Job details fetched', { id })
      return createSuccessResponse({ job: jobDetails, chunks })
    } catch (error) {
      return createErrorResponse(error, 'Failed to get job details')
    }
  },
)
