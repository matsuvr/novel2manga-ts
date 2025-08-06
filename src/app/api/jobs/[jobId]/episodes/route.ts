import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { DatabaseService } from '@/services/database'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'

const postRequestSchema = z.object({
  config: z
    .object({
      targetCharsPerEpisode: z.number().int().optional(),
      minCharsPerEpisode: z.number().int().optional(),
      maxCharsPerEpisode: z.number().int().optional(),
    })
    .optional(),
})

export async function GET(_request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    // jobId が未定義または "undefined" の場合は無効とみなす
    if (!params.jobId || params.jobId === 'undefined') {
      return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 })
    }
    const dbService = new DatabaseService()

    // ジョブの存在確認
    const job = await dbService.getJobWithProgress(params.jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // エピソード一覧を取得
    const episodes = await dbService.getEpisodesByJobId(params.jobId)

    return NextResponse.json({
      jobId: params.jobId,
      totalEpisodes: episodes.length,
      episodes: episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        summary: ep.summary,
        startChunk: ep.startChunk,
        endChunk: ep.endChunk,
        estimatedPages: ep.estimatedPages,
        confidence: ep.confidence,
      })),
    })
  } catch (error) {
    console.error('Error fetching episodes:', error)
    return NextResponse.json({ error: 'Failed to fetch episodes' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { jobId: string } }) {
  try {
    // jobId が未定義または "undefined" の場合は無効とみなす
    if (!params.jobId || params.jobId === 'undefined') {
      return NextResponse.json({ error: 'Invalid jobId' }, { status: 400 })
    }

    const body = await request.json()
    const validatedData = postRequestSchema.parse(body)
    const { config } = validatedData

    const dbService = new DatabaseService()
    const processor = new JobNarrativeProcessor(dbService, config)

    // ジョブの存在確認
    const job = await dbService.getJobWithProgress(params.jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // エピソード分析がすでに完了している場合
    if (job.episodeCompleted) {
      const episodes = await dbService.getEpisodesByJobId(params.jobId)
      return NextResponse.json({
        message: 'Episode analysis already completed',
        jobId: params.jobId,
        status: 'completed',
        totalEpisodes: episodes.length,
        episodes: episodes.map((ep) => ({
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          summary: ep.summary,
          startChunk: ep.startChunk,
          endChunk: ep.endChunk,
          estimatedPages: ep.estimatedPages,
          confidence: ep.confidence,
        })),
      })
    }

    // バックグラウンドでエピソード分析を開始
    processor
      .processJob(params.jobId, (progress) => {
        console.log(`Episode analysis job ${params.jobId} progress:`, {
          processedChunks: progress.processedChunks,
          totalChunks: progress.totalChunks,
          episodes: progress.episodes.length,
          currentStep: progress.currentStep,
        })
      })
      .catch((error) => {
        console.error(`Error processing episode analysis job ${params.jobId}:`, error)
      })

    return NextResponse.json({
      message: 'Episode analysis started',
      jobId: params.jobId,
      status: 'processing',
    })
  } catch (error) {
    console.error('Error starting episode analysis:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 },
      )
    }

    return NextResponse.json({ error: 'Failed to start episode analysis' }, { status: 500 })
  }
}
