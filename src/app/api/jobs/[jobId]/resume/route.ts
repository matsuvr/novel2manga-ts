import type { NextRequest } from 'next/server'
import { getDatabaseService } from '@/services/db-factory'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { getJobQueue } from '@/services/queue'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
} from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    validateJobId(params.jobId)
    const dbService = getDatabaseService()
    const queue = getJobQueue()

    // ジョブが再開可能かチェック
    // 互換性のため既存のProcessorのcanResumeを使用（テストもこれをモック）
    const processor = new JobNarrativeProcessor(dbService)
    const canResume = await processor.canResumeJob(params.jobId)
    if (!canResume) {
      // Match test expectation exactly
      throw new ApiError(
        'Job cannot be resumed. It may be completed or not found.',
        400,
        'INVALID_STATE',
      )
    }

    // 任意の通知メール（同意済みの場合のみ）
    const { userEmail } = (await request.json().catch(() => ({}))) as {
      userEmail?: string
    }

    // バックグラウンドキューに投入
    await queue.enqueue({
      type: 'PROCESS_NARRATIVE',
      jobId: params.jobId,
      userEmail,
    })
    // ステータス更新（processing）
    await dbService.updateJobStatus(params.jobId, 'processing')

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
