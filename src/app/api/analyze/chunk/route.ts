import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getChunkAnalyzerAgent } from '@/agents/chunk-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { StorageFactory, StorageKeys } from '@/utils/storage'

// リクエストボディのバリデーションスキーマ
const analyzeChunkRequestSchema = z.object({
  jobId: z.string(),
  chunkIndex: z.number(),
})

// 6要素の出力スキーマ: summary, characters, scenes, dialogues, highlights, situations
const textAnalysisOutputSchema = z.object({
  summary: z.string().describe('このチャンクの内容要約（100-200文字）'),
  characters: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      firstAppearance: z.number(),
    }),
  ),
  scenes: z.array(
    z.object({
      location: z.string(),
      time: z.string().optional(),
      description: z.string(),
      startIndex: z.number(),
      endIndex: z.number(),
    }),
  ),
  dialogues: z.array(
    z.object({
      speakerId: z.string(),
      text: z.string(),
      emotion: z.string().optional(),
      index: z.number(),
    }),
  ),
  highlights: z.array(
    z.object({
      type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
      description: z.string(),
      importance: z.number().min(1).max(10).describe('重要度を1-10に変更'),
      startIndex: z.number(),
      endIndex: z.number(),
      text: z.string().optional().describe('該当部分のテキスト抜粋'),
    }),
  ),
  situations: z.array(
    z.object({
      description: z.string(),
      index: z.number(),
    }),
  ),
})

export async function POST(request: NextRequest) {
  try {
    // リクエストボディの取得とバリデーション
    const body = await request.json()
    const { jobId, chunkIndex } = analyzeChunkRequestSchema.parse(body)

    console.log(`[/api/analyze/chunk] Analyzing chunk ${chunkIndex} for job ${jobId}`)

    // ストレージから必要なデータを取得
    const chunkStorage = await StorageFactory.getChunkStorage()
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // 既に分析済みかチェック
    const analysisPath = StorageKeys.chunkAnalysis(jobId, chunkIndex)
    const existingAnalysis = await analysisStorage.get(analysisPath)

    if (existingAnalysis) {
      console.log(`[/api/analyze/chunk] Analysis already exists for chunk ${chunkIndex}`)
      const analysisData = JSON.parse(existingAnalysis.text)
      return createSuccessResponse({
        cached: true,
        data: analysisData.analysis,
      })
    }

    // チャンクテキストを取得
    const chunkPath = StorageKeys.chunk(jobId, chunkIndex)
    const chunkFile = await chunkStorage.get(chunkPath)

    if (!chunkFile) {
      // Explicit 404 ApiError so tests receive 404 status
      const { ApiError } = await import('@/utils/api-error')
      return createErrorResponse(
        new ApiError(`Chunk file not found: ${chunkPath}`, 404, 'NOT_FOUND'),
      )
    }

    const chunkText = chunkFile.text
    console.log(`[/api/analyze/chunk] Loaded chunk text (${chunkText.length} chars)`)

    // 設定を取得してプロンプトを生成
    const config = getTextAnalysisConfig()
    const prompt = config.userPromptTemplate
      .replace('{{chunkIndex}}', chunkIndex.toString())
      .replace('{{chunkText}}', chunkText)
      .replace('{{previousChunkText}}', '') // 簡易版では前後のテキストは省略
      .replace('{{nextChunkText}}', '')

    console.log(`[/api/analyze/chunk] Sending to LLM for analysis...`)

    // エージェントを使用してチャンクを分析
    const agent = getChunkAnalyzerAgent()
    const result = await agent.generateObject(
      [{ role: 'user', content: prompt }],
      textAnalysisOutputSchema,
      { maxRetries: 2 },
    )

    if (!result) {
      throw new Error('Failed to generate analysis result')
    }

    console.log(`[/api/analyze/chunk] Analysis complete:`)
    console.log(`  - Characters: ${result.characters.length}`)
    console.log(`  - Scenes: ${result.scenes.length}`)
    console.log(`  - Dialogues: ${result.dialogues.length}`)
    console.log(`  - Highlights: ${result.highlights.length}`)
    console.log(`  - Situations: ${result.situations.length}`)

    // 分析結果をストレージに保存
    const analysisData = {
      chunkIndex,
      jobId,
      analysis: result,
      analyzedAt: new Date().toISOString(),
    }

    await analysisStorage.put(analysisPath, JSON.stringify(analysisData, null, 2))
    console.log(`[/api/analyze/chunk] Saved analysis to ${analysisPath}`)

    // レスポンスを返却
    return createSuccessResponse({ cached: false, data: result })
  } catch (error) {
    console.error('[/api/analyze/chunk] Error:', error)

    if (error instanceof z.ZodError) {
      return createErrorResponse(error, 'Invalid request data')
    }

    // Preserve original not found status
    if (error instanceof Error && error.message.startsWith('Chunk file not found')) {
      const { ApiError } = await import('@/utils/api-error')
      return createErrorResponse(new ApiError(error.message, 404, 'NOT_FOUND'))
    }
    return createErrorResponse(error, 'Failed to analyze chunk')
  }
}
