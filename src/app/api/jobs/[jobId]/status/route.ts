export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getJobRepository } from '@/repositories'
import { ApiError, extractErrorMessage } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'
import { validateJobId } from '@/utils/validators'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const params = await ctx.params
    // jobId validation (共通ユーティリティ)
    validateJobId(params.jobId)

    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/status',
      method: 'GET',
      jobId: params.jobId,
    })
    logger.info('Fetching job status')
    const startTime = Date.now()

    const jobRepo = getJobRepository()
    const job = await jobRepo.getJobWithProgress(params.jobId)

    const duration = Date.now() - startTime
    logger.info('Database query completed', { durationMs: duration })
    logger.info('Job result', {
      found: !!job,
      details: job ? { id: job.id, status: job.status } : null,
    })

    if (!job) {
      logger.warn('Job not found in database')
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
    }

    // サーバー側の保険: レンダリング完了フラグが立っていれば completed として返す
    const isCompleted =
      job.status === 'completed' || (job.renderCompleted && job.currentStep === 'complete')

    const res = ApiResponder.success({
      job: {
        id: job.id,
        status: isCompleted ? 'completed' : job.status,
        currentStep: isCompleted ? 'complete' : job.currentStep,
        splitCompleted: job.splitCompleted ?? false,
        analyzeCompleted: job.analyzeCompleted ?? false,
        episodeCompleted: job.episodeCompleted ?? false,
        layoutCompleted: job.layoutCompleted ?? false,
        renderCompleted: job.renderCompleted ?? false,
        processedChunks: job.processedChunks ?? 0,
        totalChunks: job.totalChunks ?? 0,
        processedEpisodes: job.processedEpisodes ?? 0,
        totalEpisodes: job.totalEpisodes ?? 0,
        renderedPages: job.renderedPages ?? 0,
        totalPages: job.totalPages ?? 0,
        lastError: job.lastError,
        lastErrorStep: job.lastErrorStep,
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    })
    // 明示的にキャッシュ無効化（ブラウザ/中間キャッシュ対策）
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
    return res
  } catch (error) {
    const logger = getLogger().withContext({
      route: 'api/jobs/[jobId]/status',
      method: 'GET',
    })
    logger.error('Error fetching job status', {
      error: extractErrorMessage(error),
    })
    // テスト期待: data.error は常に 'Failed to fetch job status'、詳細には元エラー
    if (error instanceof ApiError) {
      // NOT_FOUND や VALIDATION はそのまま返却
      if (error.statusCode === 404 || error.statusCode === 400) {
        return ApiResponder.error(error)
      }
    }
    // それ以外はメッセージ固定
    const causeMessage = extractErrorMessage(error)
    // テスト互換: エラーメッセージ固定 & details 文字列
    return ApiResponder.error(
      new ApiError('Failed to fetch job status', 500, 'INTERNAL_ERROR', causeMessage),
    )
  }
}
