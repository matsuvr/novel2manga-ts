export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { getDatabaseService } from '@/services/db-factory'
import { ApiResponder } from '@/utils/api-responder'

export async function POST(_req: NextRequest) {
  const logger = getLogger().withContext({ route: 'api/jobs/reconcile-render', method: 'POST' })
  try {
    const db = getDatabaseService()
    const candidates = await db.getIncompleteRenderJobs()
    const repaired: Array<{
      jobId: string
      renderedPages: number
      totalPages: number
      adjustedTotalPages?: number
    }> = []
    const skipped: Array<{ jobId: string; reason: string }> = []

    for (const job of candidates) {
      try {
        const rendered = await db.countRenderedPagesByJob(job.id)
        const originalTotal = job.totalPages || 0
        if (originalTotal === 0) {
          skipped.push({ jobId: job.id, reason: 'totalPages=0' })
          continue
        }

        // 実際のレンダリング数を優先して判定
        if (rendered >= originalTotal) {
          // 通常のケース：計画通り完了
          await db.setJobRenderedPages(job.id, rendered)
          await db.markJobStepCompleted(job.id, 'render')
          await db.updateJobStep(job.id, 'complete')
          await db.updateJobStatus(job.id, 'completed')
          repaired.push({ jobId: job.id, renderedPages: rendered, totalPages: originalTotal })
        } else if (rendered > 0 && rendered < originalTotal) {
          // 部分的にレンダリングされたケース：totalPagesを実際のrenderedPagesに修正
          logger.warn('Partial render detected, adjusting totalPages', {
            jobId: job.id,
            originalTotal,
            actualRendered: rendered,
          })

          await db.setJobRenderedPages(job.id, rendered)
          // totalPagesを実際のrenderedPagesに修正
          await db.updateJobTotalPages(job.id, rendered)
          await db.markJobStepCompleted(job.id, 'render')
          await db.updateJobStep(job.id, 'complete')
          await db.updateJobStatus(job.id, 'completed')
          repaired.push({
            jobId: job.id,
            renderedPages: rendered,
            totalPages: originalTotal,
            adjustedTotalPages: rendered,
          })
        } else {
          skipped.push({ jobId: job.id, reason: `rendered ${rendered} < total ${originalTotal}` })
        }
      } catch (e) {
        skipped.push({ jobId: job.id, reason: (e as Error).message })
      }
    }

    logger.info('Reconcile finished', { repaired: repaired.length, skipped: skipped.length })
    return ApiResponder.success({ ok: true, repaired, skipped })
  } catch (error) {
    logger.error('Reconcile failed', { error: (error as Error).message })
    return ApiResponder.error(error)
  }
}
