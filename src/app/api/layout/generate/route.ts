import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateMangaLayout } from '@/agents/layout-generator'
import { getDatabaseService } from '@/services/db-factory'
import { EpisodeRepository } from '@/repositories/episode-repository'
import type { ChunkData, EpisodeData } from '@/types/panel-layout'
import { ApiError, createErrorResponse } from '@/utils/api-error'
import { getChunkData, StorageFactory } from '@/utils/storage'

const requestSchema = z.object({
  jobId: z.string(),
  episodeNumber: z.number().int().positive(),
  config: z
    .object({
      panelsPerPage: z
        .object({
          min: z.number().optional(),
          max: z.number().optional(),
          average: z.number().optional(),
        })
        .optional(),
      dialogueDensity: z.number().min(0).max(1).optional(),
      visualComplexity: z.number().min(0).max(1).optional(),
      highlightPanelSizeMultiplier: z.number().min(1).max(3).optional(),
      readingDirection: z.literal('right-to-left').optional(),
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = requestSchema.parse(body)
    const { jobId, episodeNumber, config } = validatedData

  const dbService = getDatabaseService()
  const episodeRepo = new EpisodeRepository(dbService)

    // ジョブとエピソード情報を取得
    const job = await dbService.getJobWithProgress(jobId)
    if (!job) {
      throw new ApiError('Job not found', 404, 'NOT_FOUND')
    }

  const episodes = await episodeRepo.getByJobId(jobId)
    const episode = episodes.find((ep) => ep.episodeNumber === episodeNumber)
    if (!episode) {
      throw new ApiError('Episode not found', 404, 'NOT_FOUND')
    }

    // ここまででepisodeは必ず存在
    const ensuredEpisode = episode

    // エピソードに含まれるチャンクの解析結果を取得
    const chunkDataArray: ChunkData[] = []

    for (let i = ensuredEpisode.startChunk; i <= ensuredEpisode.endChunk; i++) {
      const chunkContent = await getChunkData(jobId, i)
      if (!chunkContent) {
        throw new Error(
          `Chunk ${i} not found for job ${jobId}. Cannot proceed with layout generation.`,
        )
      }

      // チャンク解析結果を取得（Storage経由: analyses/{jobId}/chunk_{i}.json）
      try {
        const analysisStorage = await StorageFactory.getAnalysisStorage()
        const key = `analyses/${jobId}/chunk_${i}.json`
        const obj = await analysisStorage.get(key)
        if (!obj) {
          throw new Error('analysis not found')
        }
        const parsed = JSON.parse(obj.text)
        const analysis = parsed.analysis ?? parsed

        // エピソード境界を考慮した部分チャンクの処理
        const isPartial = i === ensuredEpisode.startChunk || i === ensuredEpisode.endChunk
        const startOffset = i === ensuredEpisode.startChunk ? ensuredEpisode.startCharIndex : 0
        const endOffset =
          i === ensuredEpisode.endChunk ? ensuredEpisode.endCharIndex : chunkContent.text.length

        chunkDataArray.push({
          chunkIndex: i,
          text: chunkContent.text.substring(startOffset, endOffset),
          analysis: analysis,
          isPartial,
          startOffset,
          endOffset,
        })
      } catch (error) {
        console.error(`Failed to load analysis for chunk ${i}:`, error)
      }
    }

    if (chunkDataArray.length === 0) {
      throw new ApiError('Chunk analysis data not found', 404, 'NOT_FOUND')
    }

    // エピソードデータを構築
    const episodeData: EpisodeData = {
      chunkAnalyses: chunkDataArray.map((chunk) => chunk.analysis),
      author: job.jobName || 'Unknown Author',
      title: `Episode ${ensuredEpisode.episodeNumber}` as const,
      episodeNumber: ensuredEpisode.episodeNumber,
      episodeTitle: ensuredEpisode.title || undefined,
      episodeSummary: ensuredEpisode.summary || undefined,
      startChunk: ensuredEpisode.startChunk,
      startCharIndex: ensuredEpisode.startCharIndex,
      endChunk: ensuredEpisode.endChunk,
      endCharIndex: ensuredEpisode.endCharIndex,
      estimatedPages: ensuredEpisode.estimatedPages,
      chunks: chunkDataArray,
    }

    // レイアウトを生成
    // デフォルト値を設定してLayoutGenerationConfigを満たす
    const fullConfig = {
      panelsPerPage: {
        min: config?.panelsPerPage?.min ?? 3,
        max: config?.panelsPerPage?.max ?? 6,
        average: config?.panelsPerPage?.average ?? 4.5,
      },
      dialogueDensity: config?.dialogueDensity ?? 0.6,
      visualComplexity: config?.visualComplexity ?? 0.7,
      highlightPanelSizeMultiplier: config?.highlightPanelSizeMultiplier ?? 2.0,
      readingDirection: config?.readingDirection ?? ('right-to-left' as const),
    }
    const layout = await generateMangaLayout(episodeData, fullConfig)

    // YAMLファイルとして保存
    const yamlContent = yaml.dump(layout, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })

    const outputDir = path.join(process.cwd(), '.local-storage', 'layouts', jobId)
    await fs.mkdir(outputDir, { recursive: true })

    const outputPath = path.join(outputDir, `episode_${episodeNumber}_layout.yaml`)
    await fs.writeFile(outputPath, yamlContent, 'utf-8')

    return NextResponse.json({
      message: 'Layout generated successfully',
      jobId,
      episodeNumber,
      layoutPath: outputPath,
      layout: layout,
    })
  } catch (error) {
    console.error('Error generating layout:', error)
    return createErrorResponse(error, 'Failed to generate layout')
  }
}
