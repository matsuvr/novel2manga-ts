import type { NextRequest } from 'next/server'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/utils/api-error'

interface TokenUsageResponse {
  success: true
  tokenUsage: unknown[]
}

export const GET = withAuth(
  async (
    _request: NextRequest,
    user,
    ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
  ) => {
    try {
      const { jobId } = await ctx.params
      if (!jobId || jobId === 'undefined') {
        throw new ValidationError('jobId is required')
      }

      const job = await db.jobs().getJob(jobId)
      if (!job) {
        throw new NotFoundError('指定されたジョブが見つかりません')
      }
      if (job.userId !== user.id) {
        throw new ForbiddenError('アクセス権限がありません')
      }

      const rows = await db.tokenUsage().listByJob(jobId)
      return createSuccessResponse<TokenUsageResponse>({ success: true, tokenUsage: rows })
    } catch (error) {
      return createErrorResponse(error)
    }
  },
)
