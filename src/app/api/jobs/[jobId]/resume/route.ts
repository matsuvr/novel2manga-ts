import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { EpisodeWriteService } from '@/services/application/episode-write'
import { JobProgressService } from '@/services/application/job-progress'
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

    // ジョブが再開可能かチェック
    // 互換性のため既存のProcessorのcanResumeを使用（テストもこれをモック）
    const processor = new JobNarrativeProcessor(new JobProgressService(), new EpisodeWriteService())
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

    // ジョブキューを使用してバックグラウンド処理を実行
    // Cloudflare Workersの場合、Queue Consumerが処理を担当
    const queue = getJobQueue()
    void queue.enqueue({
      type: 'PROCESS_NARRATIVE',
      jobId: params.jobId,
      userEmail,
    })

    // ステータスをprocessingに更新
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
