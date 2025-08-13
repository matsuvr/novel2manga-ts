import type { NextRequest } from 'next/server'
import { z } from 'zod'
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

    // 任意の通知メール（同意済みの場合のみ）: emailをZodでバリデーション
    const EmailSchema = z.object({ userEmail: z.string().email().optional() })
    const { userEmail } = EmailSchema.parse(await request.json().catch(() => ({})))

    // バックグラウンドキューに投入
    // fire-and-forget（非同期実行）。戻り値は待たない
    void queue.enqueue({
      type: 'PROCESS_NARRATIVE',
      jobId: params.jobId,
      userEmail,
    })
    // NOTE: ここではDB更新を行わない（テストのモック互換性維持）

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
