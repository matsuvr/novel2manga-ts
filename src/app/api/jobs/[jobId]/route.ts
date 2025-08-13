import type { NextRequest } from 'next/server'
import { getDatabaseService } from '@/services/db-factory'
import { getJobQueue } from '@/services/queue'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const db = getDatabaseService()
    const { userEmail } = (await request.json().catch(() => ({}))) as {
      userEmail?: string
    }

    // 同意済みのメールアドレスが渡された場合のみ通知に使用
    const queue = getJobQueue()
    await queue.enqueue({
      type: 'PROCESS_NARRATIVE',
      jobId: params.jobId,
      userEmail,
    })

    // ステータスをprocessingに更新
    await db.updateJobStatus(params.jobId, 'processing')

    return createSuccessResponse({
      message: 'Job enqueued',
      jobId: params.jobId,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to enqueue job')
  }
}
