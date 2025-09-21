import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import { withAuth } from '@/utils/api-auth'
import {
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
  NotFoundError,
} from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'
import { resolveBaseUrl } from '../share-utils'

interface ShareStatusResponse {
  share: {
    enabled: boolean
    shareUrl?: string
    expiresAt?: string | null
    episodeNumbers?: number[]
  }
}

export const GET = withAuth(
  async (request: NextRequest, user, context: { params: { jobId: string } }) => {
    const params = await Promise.resolve(context.params)
    try {
      const { jobId } = params
      validateJobId(jobId)

      const job = await db.jobs().getJob(jobId)
      if (!job) {
        throw new NotFoundError('指定されたジョブが見つかりません')
      }

      if (job.userId && job.userId !== user.id) {
        throw new ForbiddenError('アクセス権限がありません')
      }

      const shareRecord = await db.share().getShareByJobId(jobId)
      const now = Date.now()
      const shareActive =
        !!shareRecord &&
        shareRecord.isEnabled &&
        (!shareRecord.expiresAt || new Date(shareRecord.expiresAt).getTime() > now)

      const baseUrl = resolveBaseUrl(request)
      const shareStatus: ShareStatusResponse['share'] = shareActive && shareRecord
        ? {
            enabled: true,
            shareUrl: `${baseUrl}/share/${shareRecord.token}`,
            expiresAt: shareRecord.expiresAt ?? null,
            episodeNumbers: shareRecord.episodeNumbers,
          }
        : { enabled: false }

      return createSuccessResponse<ShareStatusResponse>({ share: shareStatus })
    } catch (error) {
      getLogger()
        .withContext({ route: 'api/share/[jobId]', method: 'GET' })
        .error('Failed to load share status', {
          jobId: params.jobId,
          error: error instanceof Error ? error.message : String(error),
        })
      return createErrorResponse(error)
    }
  },
)

export const DELETE = withAuth(
  async (_request: NextRequest, user, context: { params: { jobId: string } }) => {
    const params = await Promise.resolve(context.params)
    try {
      const { jobId } = params
      validateJobId(jobId)

      const job = await db.jobs().getJob(jobId)
      if (!job) {
        throw new NotFoundError('指定されたジョブが見つかりません')
      }

      if (job.userId && job.userId !== user.id) {
        throw new ForbiddenError('アクセス権限がありません')
      }

      await db.share().disableShare(jobId)

      return createSuccessResponse({ success: true })
    } catch (error) {
      getLogger()
        .withContext({ route: 'api/share/[jobId]', method: 'DELETE' })
        .error('Failed to disable share', {
          jobId: params.jobId,
          error: error instanceof Error ? error.message : String(error),
        })
      return createErrorResponse(error)
    }
  },
)
