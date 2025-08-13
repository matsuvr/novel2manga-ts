import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getDatabaseService } from '@/services/db-factory'
import { getJobQueue } from '@/services/queue'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const db = getDatabaseService()
    const EmailSchema = z.object({ userEmail: z.string().email().optional() })
    const { userEmail } = EmailSchema.parse(await request.json().catch(() => ({})))

    // 同意済みのメールアドレスが渡された場合のみ通知に使用
    const queue = getJobQueue()
    // fire-and-forget（非同期実行）。戻り値は待たない
    void queue.enqueue({
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
