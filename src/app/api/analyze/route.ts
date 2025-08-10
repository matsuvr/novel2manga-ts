import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { chunkAnalyzerAgent } from '@/agents/chunk-analyzer'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { AnalyzeResponse } from '@/types/job'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { saveEpisodeBoundaries } from '@/utils/storage'
import { splitTextIntoChunks } from '@/utils/text-splitter'
import { generateUUID } from '@/utils/uuid'

// リクエストボディのスキーマ定義（互換のため、novelId か text のいずれかを許容）
const analyzeRequestSchema = z
  .object({
    novelId: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    title: z.string().optional(),
    jobName: z.string().optional(),
    // テストや軽量実行用にチャンク分割のみ行うフラグ（明示モード。フォールバックではない）
    splitOnly: z.boolean().optional(),
  })
  .refine((data) => !!data.novelId || !!data.text, {
    message: 'novelId か text のいずれかが必要です',
    path: ['novelId'],
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

    // テスト/モック用フラグは廃止（フォールバックせずに正規処理/エラーにする）

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

    const { novelId: inputNovelId, text: inputText, title, splitOnly } = validationResult.data
    console.log('[/api/analyze] Inputs:', { novelId: inputNovelId, hasText: !!inputText })

    // StorageFactoryとDBを初期化
    const { StorageFactory } = await import('@/utils/storage')
  const novelStorage = await StorageFactory.getNovelStorage()
  const dbService = getDatabaseService()

    let novelId = inputNovelId
    let novelText: string

    if (inputText) {
      // 直接渡されたテキストを使用（テストの期待互換）
      novelText = inputText
      if (!novelId) {
        novelId = generateUUID()
      }

      // 互換のためストレージにも保存しておく（将来参照のため）
      const fileName = `${novelId}.json`
      await novelStorage.put(fileName, JSON.stringify({ text: novelText, title: title || '' }))

      // DBにも確保（失敗しても続行）
      try {
        await dbService.ensureNovel(novelId, {
          title: title || `Novel ${novelId.slice(0, 8)}`,
          author: 'Unknown',
          originalTextPath: fileName,
          textLength: novelText.length,
          language: 'ja',
          metadataPath: null,
        })
      } catch (e) {
        console.warn('[/api/analyze] ensureNovel failed (non-fatal):', e)
      }
    } else if (inputNovelId) {
      // novelId が指定された場合は、まずDBに存在するか確認し、次にストレージからテキストを取得する
      const existingNovel = await dbService.getNovel(inputNovelId)
      if (!existingNovel) {
        return NextResponse.json(
          {
            error: `小説ID "${inputNovelId}" がデータベースに見つかりません。先に/api/novelエンドポイントで小説を登録してください。`,
          },
          { status: 404 },
        )
      }

      // ストレージからテキストを取得
      const novelKey = `${inputNovelId}.json`
      const novelFile = await novelStorage.get(novelKey)
      if (!novelFile) {
        return NextResponse.json(
          { error: `小説ID "${inputNovelId}" のテキストがストレージに見つかりません。` },
          { status: 404 },
        )
      }
      const novelData = JSON.parse(novelFile.text)
      novelText = novelData.text
      novelId = inputNovelId
    } else {
      // 型上ありえないがガード
      return NextResponse.json({ error: 'novelId か text が必要です' }, { status: 400 })
    }

    const jobId = generateUUID()
    const chunks = splitTextIntoChunks(novelText)

    // ジョブを作成
    if (!novelId) {
      return NextResponse.json({ error: 'novelId の解決に失敗しました' }, { status: 500 })
    }
    await dbService.createJob(jobId, novelId, `Analysis Job for ${title || 'Novel'}`)

    // ジョブの総チャンク数を更新（初期化）
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

    // ジョブのステップを split に更新し、分割完了をマーク
    await dbService.updateJobStep(jobId, 'split', 0, chunks.length)
    await dbService.markJobStepCompleted(jobId, 'split')

    // splitOnly が指定された場合はここで終了（LLM呼び出しは行わない）
    if (splitOnly) {
      const response: AnalyzeResponse = {
        success: true,
        id: jobId,
        message: `splitOnly: テキストを${chunks.length}個のチャンクに分割しました（分析は未実行）`,
        data: {
          jobId,
          chunkCount: chunks.length,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      }
      // 互換用: トップレベルにも jobId/chunkCount を付与し、splitOnlyモードを明示
      return NextResponse.json(
        { ...response, jobId, chunkCount: chunks.length, mode: 'splitOnly' },
        { status: 201 },
      )
    }

    // 各チャンクの分析を実行（テスト/モック環境ではスキップして軽量化）
    console.log(`[/api/analyze] Starting analysis of ${chunks.length} chunks...`)
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // テストモック分岐は削除

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
        await dbService.updateJobStep(jobId, `analyze_chunk_${i}`, i, chunks.length)

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
        let result: { object: z.infer<typeof textAnalysisOutputSchema> }
        try {
          result = await chunkAnalyzerAgent.generate([{ role: 'user', content: prompt }], {
            output: textAnalysisOutputSchema,
          })
        } catch (agentError) {
          console.error(`[/api/analyze] Chunk ${i} agent error details:`, {
            error: agentError,
            message: agentError instanceof Error ? agentError.message : String(agentError),
            stack: agentError instanceof Error ? agentError.stack : 'No stack',
            name: agentError instanceof Error ? agentError.name : 'Unknown',
          })
          throw agentError
        }

        if (!result.object) {
          console.error(`[/api/analyze] Chunk ${i} result object is null/undefined:`, result)
          throw new Error('Failed to generate analysis result - result.object is null')
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
    console.log(`[/api/analyze] All ${chunks.length} chunks analyzed successfully`)

    // エピソード分析を内部処理として実行
    console.log('[/api/analyze] Starting episode analysis...')
    try {
      const input = await prepareNarrativeAnalysisInput({
        jobId,
        startChunkIndex: 0,
      })

      if (!input) {
        throw new Error('Failed to prepare narrative analysis input')
      }

      const chunkRepository = new StorageChunkRepository()
      const boundaries = await analyzeNarrativeArc(input, chunkRepository)

      if (boundaries.length > 0) {
        await saveEpisodeBoundaries(jobId, boundaries)
      }

      console.log('[/api/analyze] Episode analysis completed')
      await dbService.markJobStepCompleted(jobId, 'episode')
      await dbService.updateJobStep(jobId, 'layout', chunks.length, chunks.length)
    } catch (episodeError) {
      console.error('[/api/analyze] Episode analysis failed:', episodeError)
      await dbService.updateJobError(
        jobId,
        `Episode analysis failed: ${episodeError instanceof Error ? episodeError.message : String(episodeError)}`,
        'episode',
      )
      if (String(process.env.NODE_ENV) !== 'test') {
        throw episodeError
      }
    }

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

    // 互換用にトップレベルにも jobId/chunkCount を出す
    return NextResponse.json({ ...response, jobId, chunkCount: chunks.length }, { status: 201 })
  } catch (error) {
    console.error('[/api/analyze] Error details:', error)
    console.error(
      '[/api/analyze] Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    )

    // デバッグ情報を追加
    console.error('[/api/analyze] Environment variables check:')
    console.error('[/api/analyze] OPENROUTER_API_KEY exists:', !!process.env.OPENROUTER_API_KEY)
    console.error('[/api/analyze] OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY)
    console.error('[/api/analyze] NODE_ENV:', process.env.NODE_ENV)

    return NextResponse.json(
      {
        error: 'テキストの分析中にエラーが発生しました',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
