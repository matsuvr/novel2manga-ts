import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chunkAnalyzerAgent } from '@/agents/chunk-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { DatabaseService } from '@/services/database'
import type { AnalyzeResponse } from '@/types/job'
import { splitTextIntoChunks } from '@/utils/text-splitter'
import { generateUUID } from '@/utils/uuid'

// リクエストボディのスキーマ定義
const analyzeRequestSchema = z.object({
  novelId: z.string().min(1, 'novelIdは必須です'),
  jobName: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    console.log('[/api/analyze] Request received')

    // JSONパースエラーハンドリング
    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch (error) {
      console.error('[/api/analyze] JSON parse error:', error)
      return NextResponse.json({ error: '無効なJSONが送信されました' }, { status: 400 })
    }

    console.log('[/api/analyze] Raw body:', rawBody)

    // スキーマ検証
    const validationResult = analyzeRequestSchema.safeParse(rawBody)
    if (!validationResult.success) {
      console.error('[/api/analyze] Validation error:', validationResult.error)
      return NextResponse.json(
        {
          error: 'リクエストボディが無効です',
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
        { status: 400 },
      )
    }

    const { novelId, jobName } = validationResult.data
    console.log('[/api/analyze] Novel ID:', novelId)

    // StorageFactoryを使って小説テキストを取得
    console.log('[/api/analyze] Importing StorageFactory...')
    const { StorageFactory } = await import('@/utils/storage')
    console.log('[/api/analyze] Getting storage instances...')
    const novelStorage = await StorageFactory.getNovelStorage()
    const dbService = new DatabaseService()
    console.log('[/api/analyze] Storage initialized')

    // 小説がDBに存在するか確認
    console.log('[/api/analyze] Checking novel in database...')
    const existingNovel = await dbService.getNovel(novelId)
    if (!existingNovel) {
      console.log('[/api/analyze] Novel not found in database')
      return NextResponse.json(
        {
          error: `小説ID "${novelId}" がデータベースに見つかりません。先に/api/novelエンドポイントで小説を登録してください。`,
        },
        { status: 404 },
      )
    }
    console.log('[/api/analyze] Novel found:', existingNovel.title)

    // ストレージから小説テキストを取得
    const novelFile = await novelStorage.get(`${novelId}.json`)
    if (!novelFile) {
      return NextResponse.json(
        {
          error: `小説ID "${novelId}" のテキストがストレージに見つかりません。`,
        },
        { status: 404 },
      )
    }

    const novelData = JSON.parse(novelFile.text)
    const novelText = novelData.text

    const jobId = generateUUID()
    const chunks = splitTextIntoChunks(novelText)

    // ジョブを作成
    await dbService.createJob(jobId, novelId, `Analysis Job for ${existingNovel.title || 'Novel'}`)

    // ジョブの総チャンク数を更新
    await dbService.updateJobStep(jobId, 'initialized', 0, chunks.length)

    // チャンクストレージを取得
    const chunkStorage = await StorageFactory.getChunkStorage()

    // チャンクの実体をストレージに保存し、パスをDBに保存
    let currentPosition = 0
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]

      // チャンクファイルをストレージに保存
      const chunkPath = `chunks/${jobId}/chunk_${i}.txt`
      await chunkStorage.put(chunkPath, content)

      // チャンク情報をDBに保存（ファイルパスのみ）
      const startPos = currentPosition
      const endPos = currentPosition + content.length

      await dbService.createChunk({
        novelId: novelId,
        jobId: jobId,
        chunkIndex: i,
        contentPath: chunkPath,
        startPosition: startPos,
        endPosition: endPos,
        wordCount: content.length,
      })

      currentPosition = endPos
    }

    // ジョブのステータスを更新
    await dbService.updateJobStep(jobId, 'chunks_created', 0, chunks.length)

    // 各チャンクの分析を実行
    console.log(`[/api/analyze] Starting analysis of ${chunks.length} chunks...`)
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // 分析結果のスキーマ
    const textAnalysisOutputSchema = z.object({
      summary: z.string(),
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
          importance: z.number().min(1).max(10),
          startIndex: z.number(),
          endIndex: z.number(),
          text: z.string().optional(),
        }),
      ),
      situations: z.array(
        z.object({
          description: z.string(),
          index: z.number(),
        }),
      ),
    })

    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`[/api/analyze] Analyzing chunk ${i}/${chunks.length}...`)
        await dbService.updateJobStep(jobId, `analyzing_chunk_${i}`, i, chunks.length)

        // チャンクテキストを取得
        const chunkText = chunks[i]

        // 分析設定を取得してプロンプトを生成
        const config = getTextAnalysisConfig()
        console.log(`[/api/analyze] Text analysis config:`, JSON.stringify(config, null, 2))

        if (!config || !config.userPromptTemplate) {
          throw new Error(`Text analysis config is invalid: userPromptTemplate is missing`)
        }

        const prompt = config.userPromptTemplate
          .replace('{{chunkIndex}}', i.toString())
          .replace('{{chunkText}}', chunkText)
          .replace('{{previousChunkText}}', '')
          .replace('{{nextChunkText}}', '')

        // Mastraエージェントを使用して分析
        const result = await chunkAnalyzerAgent.generate([{ role: 'user', content: prompt }], {
          output: textAnalysisOutputSchema,
        })

        if (!result.object) {
          throw new Error('Failed to generate analysis result')
        }

        // 分析結果をストレージに保存
        const analysisPath = `analyses/${jobId}/chunk_${i}.json`
        const analysisData = {
          chunkIndex: i,
          jobId,
          analysis: result.object,
          analyzedAt: new Date().toISOString(),
        }

        await analysisStorage.put(analysisPath, JSON.stringify(analysisData, null, 2))
        console.log(`[/api/analyze] Chunk ${i} analyzed successfully`)
      } catch (error) {
        const errorMsg = `Failed to analyze chunk ${i}: ${error instanceof Error ? error.message : String(error)}`
        console.error(`[/api/analyze] ${errorMsg}`)
        await dbService.updateJobError(jobId, errorMsg, `analyze_chunk_${i}`)
        throw new Error(errorMsg)
      }
    }

    // 分析完了をマーク
    await dbService.markJobStepCompleted(jobId, 'analyze')
    await dbService.updateJobStep(jobId, 'analysis_completed', chunks.length, chunks.length)
    console.log(`[/api/analyze] All ${chunks.length} chunks analyzed successfully`)

    const response: AnalyzeResponse = {
      success: true,
      id: jobId,
      message: `テキストを${chunks.length}個のチャンクに分割し、分析を完了しました`,
      data: {
        jobId,
        chunkCount: chunks.length,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('[/api/analyze] Error details:', error)
    console.error(
      '[/api/analyze] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    )
    return NextResponse.json(
      {
        error: 'テキストの分析中にエラーが発生しました',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
