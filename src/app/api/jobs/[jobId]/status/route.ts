import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { getLogger, runWithLogContext } from '@/infrastructure/logging/logger'
import { getJobDetails } from '@/services/application/job-details'
import { db } from '@/services/database'
import { getAuthenticatedUser } from '@/utils/api-auth'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  ForbiddenError,
  ValidationError,
} from '@/utils/api-error'

export const GET = async (
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) => {
  return runWithLogContext({ muteConsole: true, route: 'api/jobs/[jobId]/status' }, async () => {
      const logger = getLogger().withContext({ route: 'api/jobs/[jobId]/status', method: 'GET' })
      try {
        // ctx.paramsの安全な処理
        let params: { jobId: string }
        try {
          params = await ctx.params
        } catch (error) {
          logger.error('Failed to extract params', { error })
          return createErrorResponse(new ValidationError('無効なパラメータです'))
        }

        const { jobId } = params
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
        if (job.userId) {
          let userId: string | null = null
          try {
            const authed = await Effect.runPromise(getAuthenticatedUser(_request))
            userId = authed.id
          } catch (authErr) {
            if (process.env.NODE_ENV === 'production') {
              return createErrorResponse(authErr, '認証が必要です')
            }
            logger.warn('Auth not available for status; proceeding anonymous (non-production)')
            userId = 'anonymous'
          }
          if (job.userId !== userId) {
            return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
          }
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
}

export const POST = async (
  request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) => {
  return runWithLogContext({ muteConsole: true, route: 'api/jobs/[jobId]/status' }, async () => {
    const logger = getLogger().withContext({ route: 'api/jobs/[jobId]/status', method: 'POST' })
    try {
      // ctx.paramsの安全な処理
      let params: { jobId: string }
      try {
        params = await ctx.params
      } catch (error) {
        logger.error('Failed to extract params', { error })
        return createErrorResponse(new ValidationError('無効なパラメータです'))
      }

      const { jobId } = params
      if (!jobId || jobId === 'undefined') {
        return createErrorResponse(new ValidationError('ジョブIDが指定されていません'))
      }
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return createErrorResponse(new ValidationError('JSON の解析に失敗しました'))
      }
      const { status } = (body || {}) as { status?: unknown }
      if (typeof status !== 'string' || status.length === 0) {
        return createErrorResponse(new ValidationError('status が必要です'))
      }

      const job = await db.jobs().getJob(jobId)
      if (!job) {
        return createErrorResponse(
          new ApiError('Job not found', 404, ERROR_CODES.NOT_FOUND, { jobId }),
        )
      }
      // Auth fallback (non-production) similar to GET
      if (job.userId) {
        let userId: string | null = null
        try {
          const authed = await Effect.runPromise(getAuthenticatedUser(request))
          userId = authed.id
        } catch (authErr) {
          if (process.env.NODE_ENV === 'production') {
            return createErrorResponse(authErr, '認証が必要です')
          }
          logger.warn('Auth not available for status update; proceeding anonymous (non-production)')
          userId = 'anonymous'
        }
        if (job.userId !== userId) {
          return createErrorResponse(new ForbiddenError('アクセス権限がありません'))
        }
      }

      await db.jobs().updateJobStatus(jobId, status)
      logger.info('Job status updated via POST', { jobId, status })
      return createSuccessResponse({ jobId, status })
    } catch (error) {
      if (error instanceof ApiError) {
        return createErrorResponse(error, 'Failed to update job status')
      }
      const details = error instanceof Error ? error.message : String(error)
      return createErrorResponse(
        new ApiError('Failed to update job status', 500, ERROR_CODES.INTERNAL_ERROR, details),
        'Failed to update job status',
      )
    }
  })
}
