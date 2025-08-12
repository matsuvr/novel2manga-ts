import type { NextRequest } from 'next/server'
import { getJobRepository } from '@/repositories'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
} from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
    const params = await ctx.params
    // jobId validation (共通ユーティリティ)
    validateJobId(params.jobId)

    console.log('[job-status] Fetching job status for:', params.jobId)
    const startTime = Date.now()

    const jobRepo = getJobRepository()
    const job = await jobRepo.getJobWithProgress(params.jobId)

    const duration = Date.now() - startTime
    console.log(`[job-status] Database query completed in ${duration}ms`)
    console.log('[job-status] Job found:', !!job)
    console.log('[job-status] Job details:', job ? { id: job.id, status: job.status } : 'null')

    if (!job) {
      console.log('[job-status] Job not found in database')
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
    }

    return createSuccessResponse({
      job: {
        id: job.id,
        status: job.status,
        currentStep: job.currentStep,
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
        progress: job.progress,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    })
  } catch (error) {
    console.error('[job-status] Error fetching job status:', error)
    // テスト期待: data.error は常に 'Failed to fetch job status'、詳細には元エラー
    if (error instanceof ApiError) {
      // NOT_FOUND や VALIDATION はそのまま返却
      if (error.statusCode === 404 || error.statusCode === 400) {
        return createErrorResponse(error)
      }
    }
    // それ以外はメッセージ固定
    const causeMessage = extractErrorMessage(error)
    // テストは data.details が文字列で .toContain できることを期待
    return Response.json(
      {
        success: false,
        error: 'Failed to fetch job status',
        details: causeMessage,
        code: 'INTERNAL_ERROR',
      },
      { status: 500 },
    )
  }
}
