import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'

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
    validateJobId(jobId)

    const dbService = getDatabaseService()
    const processor = new JobNarrativeProcessor(dbService, config)
    const jobRepo = new JobRepository(dbService)

    // ジョブの存在確認
    const job = await jobRepo.getJobWithProgress(jobId)
    if (!job) {
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
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

    return createSuccessResponse(
      {
        message: 'Narrative arc analysis started',
        jobId: jobId,
        status: 'processing',
      },
      202,
    )
  } catch (error) {
    console.error('Error starting narrative arc analysis:', error)
    if (error instanceof z.ZodError) {
      return createErrorResponse(error, 'Invalid request data')
    }
    return createErrorResponse(error, 'Failed to start narrative arc analysis')
  }
}
