import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chunkAnalyzerAgent } from '@/agents/chunk-analyzer'
import { getTextAnalysisConfig } from '@/config'
import type { ChunkAnalysisResult } from '@/types/chunk'
import { StorageFactory } from '@/utils/storage'

// リクエストボディのバリデーションスキーマ
const analyzeChunkRequestSchema = z.object({
  jobId: z.string(),
  chunkIndex: z.number(),
})

// 5要素の出力スキーマ
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
    const analysisPath = `analyses/${jobId}/chunk_${chunkIndex}.json`
    const existingAnalysis = await analysisStorage.get(analysisPath)

    if (existingAnalysis) {
      console.log(`[/api/analyze/chunk] Analysis already exists for chunk ${chunkIndex}`)
      const analysisData = JSON.parse(existingAnalysis.text)
      return NextResponse.json({
        success: true,
        data: analysisData.analysis,
        cached: true,
      })
    }

    // チャンクテキストを取得
    const chunkPath = `chunks/${jobId}/chunk_${chunkIndex}.txt`
    const chunkFile = await chunkStorage.get(chunkPath)

    if (!chunkFile) {
      return NextResponse.json(
        {
          success: false,
          error: `Chunk file not found: ${chunkPath}`,
        },
        { status: 404 },
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

    // Mastraエージェントを使用してチャンクを分析
    const result = await chunkAnalyzerAgent.generate([{ role: 'user', content: prompt }], {
      output: textAnalysisOutputSchema,
    })

    if (!result.object) {
      throw new Error('Failed to generate analysis result')
    }

    console.log(`[/api/analyze/chunk] Analysis complete:`)
    console.log(`  - Characters: ${result.object.characters.length}`)
    console.log(`  - Scenes: ${result.object.scenes.length}`)
    console.log(`  - Dialogues: ${result.object.dialogues.length}`)
    console.log(`  - Highlights: ${result.object.highlights.length}`)
    console.log(`  - Situations: ${result.object.situations.length}`)

    // 分析結果をストレージに保存
    const analysisData = {
      chunkIndex,
      jobId,
      analysis: result.object,
      analyzedAt: new Date().toISOString(),
    }

    await analysisStorage.put(analysisPath, JSON.stringify(analysisData, null, 2))
    console.log(`[/api/analyze/chunk] Saved analysis to ${analysisPath}`)

    // レスポンスを返却
    return NextResponse.json({
      success: true,
      data: result.object,
      cached: false,
    })
  } catch (error) {
    console.error('[/api/analyze/chunk] Error:', error)

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze chunk',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    )
  }
}
