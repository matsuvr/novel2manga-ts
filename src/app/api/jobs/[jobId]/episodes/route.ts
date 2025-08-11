import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDatabaseService } from '@/services/db-factory'
import { JobNarrativeProcessor } from '@/services/job-narrative-processor'
import { ApiError, createErrorResponse } from '@/utils/api-error'
import { validateJobId } from '@/utils/validators'
import { JobRepository } from '@/repositories/job-repository'
import { EpisodeRepository } from '@/repositories/episode-repository'

// 入力互換: 既存のconfig形式と、testsが送る { targetPages, minPages, maxPages } のいずれか
const postRequestSchema = z
  .object({
    config: z
      .object({
        targetCharsPerEpisode: z.number().int().optional(),
        minCharsPerEpisode: z.number().int().optional(),
        maxCharsPerEpisode: z.number().int().optional(),
      })
      .optional(),
    targetPages: z.number().int().optional(),
    minPages: z.number().int().optional(),
    maxPages: z.number().int().optional(),
  })
  .refine((d) => !!d.config || !!d.targetPages, {
    message: 'config か targetPages を指定してください',
    path: ['config'],
  })

export async function GET(
  _request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
  const params = await ctx.params
  validateJobId(params?.jobId)
  const dbService = getDatabaseService()
  const jobRepo = new JobRepository(dbService)
  const episodeRepo = new EpisodeRepository(dbService)

    // ジョブの存在確認
  const job = await jobRepo.getJobWithProgress(params.jobId)
    if (!job) {
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
    }

    // エピソード一覧を取得
  const episodes = await episodeRepo.getByJobId(params.jobId)

    // エピソード未作成の場合は明示的に空を返す（フォールバックしない）

    if (episodes.length === 0) {
      // エピソードが存在しない場合は404を返し、上位が異常を検知できるようにする
      throw new ApiError('No episodes found for this job', 404, 'NOT_FOUND')
    }

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
    return createErrorResponse(error, 'Failed to fetch episodes')
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: { jobId: string } | Promise<{ jobId: string }> },
) {
  try {
  const params = await ctx.params
  validateJobId(params?.jobId)

    const body = await request.json()
    const validatedData = postRequestSchema.parse(body)
    const { config, targetPages, minPages, maxPages } = validatedData

  const dbService = getDatabaseService()
    const processor = new JobNarrativeProcessor(dbService, config)

    // ジョブの存在確認
  const job = await dbService.getJobWithProgress(params.jobId)
    if (!job) {
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
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

    // 同期モードのモック生成は廃止。通常のバックグラウンド処理のみ。

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
      config: config ?? { targetPages, minPages, maxPages },
    })
  } catch (error) {
    console.error('Error starting episode analysis:', error)
    return createErrorResponse(error, 'Failed to start episode analysis')
  }
}
