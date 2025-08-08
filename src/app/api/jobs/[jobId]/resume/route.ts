import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { toErrorResponse } from '@/utils/api-error-response'
import { HttpError } from '@/utils/http-errors'

export async function POST(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    if (!params.jobId || params.jobId === 'undefined') {
      throw new HttpError('Invalid jobId', 400)
    }
    const dbService = new DatabaseService()
    const processor = new JobNarrativeProcessor(dbService)

    // ジョブが再開可能かチェック
    const canResume = await processor.canResumeJob(params.jobId)
    if (!canResume) {
      throw new HttpError('Job cannot be resumed. It may be completed or not found.', 400)
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

    return NextResponse.json({
      message: 'Job resumed successfully',
      jobId: params.jobId,
    })
  } catch (error) {
    console.error('Error resuming job:', error)
    return toErrorResponse(error, 'Failed to resume job')
  }
}
