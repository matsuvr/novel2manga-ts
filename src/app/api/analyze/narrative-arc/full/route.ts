import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { DatabaseService } from '@/services/database'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { getD1Database } from '@/utils/cloudflare-env'

const requestSchema = z.object({
  jobId: z.string(),
  config: z
    .object({
      chunksPerBatch: z.number().int().min(5).max(50).optional(),
      overlapChars: z.number().int().min(100).max(2000).optional(),
      targetCharsPerEpisode: z.number().int().optional(),
      minCharsPerEpisode: z.number().int().optional(),
      maxCharsPerEpisode: z.number().int().optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = requestSchema.parse(body)
    const { jobId, config } = validatedData

    const dbService = new DatabaseService()
    const processor = new JobNarrativeProcessor(dbService, config)

    // ジョブの存在確認
    const job = await dbService.getJobWithProgress(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // バックグラウンドで処理を開始
    // 実際の実装では、ワーカーキューやバックグラウンドジョブシステムを使用すべき
    processor
      .processJob(jobId, (progress) => {
        console.log(`Job ${jobId} progress:`, {
          processedChunks: progress.processedChunks,
          totalChunks: progress.totalChunks,
          episodes: progress.episodes.length,
        })
      })
      .catch((error) => {
        console.error(`Error processing job ${jobId}:`, error)
      })

    return NextResponse.json({
      message: 'Narrative arc analysis started',
      jobId: jobId,
      status: 'processing',
    })
  } catch (error) {
    console.error('Error starting narrative arc analysis:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 },
      )
    }

    return NextResponse.json({ error: 'Failed to start narrative arc analysis' }, { status: 500 })
  }
}
