import { type NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/services/database'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { getD1Database } from '@/utils/cloudflare-env'

export async function POST(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    const db = getD1Database()
    const dbService = new DatabaseService(db)
    const processor = new JobNarrativeProcessor(dbService)

    // ジョブが再開可能かチェック
    const canResume = await processor.canResumeJob(params.jobId)
    if (!canResume) {
      return NextResponse.json(
        { error: 'Job cannot be resumed. It may be completed or not found.' },
        { status: 400 },
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

    return NextResponse.json({
      message: 'Job resumed successfully',
      jobId: params.jobId,
    })
  } catch (error) {
    console.error('Error resuming job:', error)
    return NextResponse.json({ error: 'Failed to resume job' }, { status: 500 })
  }
}
