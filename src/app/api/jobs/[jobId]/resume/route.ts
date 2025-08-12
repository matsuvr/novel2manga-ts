import type { NextRequest } from 'next/server'
import { getDatabaseService } from '@/services/db-factory'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
} from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

export async function POST(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    validateJobId(params.jobId)
    const dbService = getDatabaseService()
    const processor = new JobNarrativeProcessor(dbService)

    // ジョブが再開可能かチェック
    const canResume = await processor.canResumeJob(params.jobId)
    if (!canResume) {
      // Match test expectation exactly
      throw new ApiError(
        'Job cannot be resumed. It may be completed or not found.',
        400,
        'INVALID_STATE',
      )
    }

    // バックグラウンドで処理を再開
    // 実際の実装では、ワーカーキューやバックグラウンドジョブシステムを使用すべき
    processor
      .processJob(params.jobId, (progress) => {
        console.log(`Job ${params.jobId} progress:`, {
          processedChunks: progress.processedChunks,
          totalChunks: progress.totalChunks,
          episodes: progress.episodes.length,
        })
      })
      .catch((error) => {
        console.error(`Error processing job ${params.jobId}:`, error)
      })

    return createSuccessResponse({
      message: 'Job resumed successfully',
      jobId: params.jobId,
    })
  } catch (error) {
    console.error('Error resuming job:', error)
    // Normalize error message for 500 case to match tests while preserving details
    const normalized =
      error instanceof ApiError
        ? error
        : new ApiError('Failed to resume job', 500, 'INTERNAL_ERROR', {
            cause: extractErrorMessage(error),
          })
    return createErrorResponse(normalized, 'Failed to resume job')
  }
}
