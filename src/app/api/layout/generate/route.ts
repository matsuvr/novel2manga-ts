import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateMangaLayout } from '@/agents/layout-generator'
import { DatabaseService } from '@/services/database'
import type { ChunkData, EpisodeData } from '@/types/panel-layout'
import { getD1Database } from '@/utils/cloudflare-env'
import { getChunkData } from '@/utils/storage'

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
    })
    .optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = requestSchema.parse(body)
    const { jobId, episodeNumber, config } = validatedData

    const db = getD1Database()
    const dbService = new DatabaseService(db)

    // ジョブとエピソード情報を取得
    const job = await dbService.getExtendedJob(jobId)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const episodes = await dbService.getEpisodesByJobId(jobId)
    const episode = episodes.find((ep) => ep.episodeNumber === episodeNumber)

    if (!episode) {
      return NextResponse.json({ error: 'Episode not found' }, { status: 404 })
    }

    // エピソードに含まれるチャンクの解析結果を取得
    const chunkDataArray: ChunkData[] = []

    for (let i = episode.startChunk; i <= episode.endChunk; i++) {
      const chunkContent = await getChunkData(jobId, i)
      if (!chunkContent) continue

      // チャンク解析結果を取得
      const analysisPath = path.join(
        process.cwd(),
        '.local-storage',
        'chunk-analysis',
        jobId,
        `chunk_${i}_analysis.json`,
      )

      try {
        const analysisContent = await fs.readFile(analysisPath, 'utf-8')
        const analysis = JSON.parse(analysisContent)

        // エピソード境界を考慮した部分チャンクの処理
        const isPartial = i === episode.startChunk || i === episode.endChunk
        const startOffset = i === episode.startChunk ? episode.startCharIndex : 0
        const endOffset =
          i === episode.endChunk ? episode.endCharIndex : chunkContent.content.length

        chunkDataArray.push({
          chunkIndex: i,
          content: chunkContent.content.substring(startOffset, endOffset),
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
      return NextResponse.json(
        { error: 'No chunk analysis data found for this episode' },
        { status: 400 },
      )
    }

    // エピソードデータを構築
    const episodeData: EpisodeData = {
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.title,
      episodeSummary: episode.summary,
      startChunk: episode.startChunk,
      startCharIndex: episode.startCharIndex,
      endChunk: episode.endChunk,
      endCharIndex: episode.endCharIndex,
      estimatedPages: episode.estimatedPages,
      chunks: chunkDataArray,
    }

    // レイアウトを生成
    const layout = await generateMangaLayout(episodeData, config)

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

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 },
      )
    }

    return NextResponse.json({ error: 'Failed to generate layout' }, { status: 500 })
  }
}
