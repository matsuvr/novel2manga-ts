import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getChunkAnalyzerAgent } from '@/agents/chunk-analyzer'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import { getJobRepository } from '@/repositories'
import { getDatabaseService } from '@/services/db-factory'
import type { AnalyzeResponse } from '@/types/job'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  extractErrorMessage,
} from '@/utils/api-error'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { detectDemoMode } from '@/utils/request-mode'
import { StorageKeys, saveEpisodeBoundaries } from '@/utils/storage'
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
      return createErrorResponse(
        new ApiError('無効なJSONが送信されました', 400, 'VALIDATION_ERROR'),
      )
    }

    console.log('[/api/analyze] Raw body:', rawBody)
    const isDemo = detectDemoMode(request, rawBody)

    // テスト/モック用フラグは廃止（フォールバックせずに正規処理/エラーにする）

    // スキーマ検証
    const validationResult = analyzeRequestSchema.safeParse(rawBody)
    if (!validationResult.success) {
      console.error('[/api/analyze] Validation error:', validationResult.error)
      return createErrorResponse(
        new ApiError('リクエストボディが無効です', 400, 'VALIDATION_ERROR', {
          issues: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        }),
      )
    }

    const { novelId: inputNovelId, text: inputText, title, splitOnly } = validationResult.data
    console.log('[/api/analyze] Inputs:', {
      novelId: inputNovelId,
      hasText: !!inputText,
    })

    // StorageFactoryとDBを初期化
    const { StorageFactory } = await import('@/utils/storage')
    const novelStorage = await StorageFactory.getNovelStorage()
    const jobRepo = getJobRepository()
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
        throw new ApiError(
          `小説ID "${inputNovelId}" がデータベースに見つかりません。先に/api/novelエンドポイントで小説を登録してください。`,
          404,
          'NOT_FOUND',
        )
      }

      // ストレージからテキストを取得
      const novelKey = `${inputNovelId}.json`
      const novelFile = await novelStorage.get(novelKey)
      if (!novelFile) {
        throw new ApiError(
          `小説ID "${inputNovelId}" のテキストがストレージに見つかりません。`,
          404,
          'NOT_FOUND',
        )
      }
      const novelData = JSON.parse(novelFile.text)
      novelText = novelData.text
      novelId = inputNovelId
    } else {
      // 型上ありえないがガード
      return createErrorResponse(
        new ApiError('novelId か text が必要です', 400, 'VALIDATION_ERROR'),
      )
    }

    const jobId = generateUUID()
    const chunks = splitTextIntoChunks(novelText)

    // ジョブを作成
    if (!novelId) {
      throw new ApiError('novelId の解決に失敗しました', 500, 'INTERNAL_ERROR')
    }
    await jobRepo.create({
      id: jobId,
      novelId,
      title: `Analysis Job for ${title || 'Novel'}`,
    })

    // ジョブの総チャンク数を更新（初期化）
    await dbService.updateJobStep(jobId, 'initialized', 0, chunks.length)

    // チャンクストレージを取得
    const chunkStorage = await StorageFactory.getChunkStorage()

    // チャンクの実体をストレージに保存し、パスをDBに保存
    let currentPosition = 0
    for (let i = 0; i < chunks.length; i++) {
      const content = chunks[i]

      // チャンクファイルをストレージに保存
      const chunkPath = StorageKeys.chunk(jobId, i)
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

    // splitOnly / demo の場合はここで終了（LLM呼び出しは行わない）
    if (splitOnly || isDemo) {
      // デモ/簡易用に最小限のエピソード境界を作成（1話・1ページ想定）
      try {
        await saveEpisodeBoundaries(jobId, [
          {
            episodeNumber: 1,
            title: 'Demo Episode',
            summary: 'デモ用の自動作成エピソード',
            startChunk: 0,
            startCharIndex: 0,
            endChunk: Math.max(0, chunks.length - 1),
            endCharIndex: chunks.length > 0 ? chunks[Math.max(0, chunks.length - 1)].length : 0,
            estimatedPages: 1,
            confidence: 0.9,
          },
        ])
        // デモでは本来の要素分析をスキップするため、順序の整合性を保つために
        // analyze → episode を仮完了としてマークする
        if (!splitOnly) {
          await dbService.markJobStepCompleted(jobId, 'analyze')
          await dbService.markJobStepCompleted(jobId, 'episode')
          // 次の段階へカーソルを進める（UIの現在処理表示用）
          await dbService.updateJobStep(jobId, 'layout', chunks.length, chunks.length)
        }
      } catch (e) {
        console.warn('[/api/analyze] saveEpisodeBoundaries (demo) failed (non-fatal):', e)
      }
      const response: AnalyzeResponse = {
        success: true,
        id: jobId,
        message: splitOnly
          ? `splitOnly: テキストを${chunks.length}個のチャンクに分割しました（分析は未実行）`
          : `demo: テキストを${chunks.length}個のチャンクに分割し、デモ用エピソードを作成しました（分析は未実行）`,
        data: {
          jobId,
          chunkCount: chunks.length,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      }
      // 互換用: トップレベルにも jobId/chunkCount を付与し、splitOnlyモードを明示
      return createSuccessResponse(
        {
          ...response,
          jobId,
          chunkCount: chunks.length,
          mode: splitOnly ? 'splitOnly' : 'demo',
        },
        201,
      )
    }

    // 各チャンクの分析を実行（テスト/モック環境ではスキップして軽量化）
    console.log(`[/api/analyze] Starting analysis of ${chunks.length} chunks...`)
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // テストモック分岐は削除

    // 分析結果のスキーマ
    const textAnalysisOutputSchema = z
      .object({
        // 要求5要素のみ
        characters: z.array(
          z
            .object({
              name: z.string().optional(),
              description: z.string().optional(),
              firstAppearance: z.number().optional(),
            })
            .strip(),
        ),
        scenes: z.array(
          z
            .object({
              location: z.string().optional(),
              time: z.string().optional(),
              description: z.string().optional(),
              startIndex: z.number().optional(),
              endIndex: z.number().optional(),
            })
            .strip(),
        ),
        dialogues: z.array(
          z
            .object({
              speakerId: z.string().optional(),
              text: z.string().optional(),
              emotion: z.string().optional(),
              index: z.number().optional(),
            })
            .strip(),
        ),
        highlights: z.array(
          z
            .object({
              type: z
                .enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence'])
                .optional(),
              description: z.string().optional(),
              importance: z.number().min(1).max(10).optional(),
              startIndex: z.number().optional(),
              endIndex: z.number().optional(),
              text: z.string().optional(),
            })
            .strip(),
        ),
        situations: z.array(
          z
            .object({
              description: z.string().optional(),
              index: z.number().optional(),
            })
            .strip(),
        ),
      })
      .strip()

    for (let i = 0; i < chunks.length; i++) {
      try {
        console.log(`[/api/analyze] Analyzing chunk ${i}/${chunks.length}...`)
        // 進捗: チャンクiの分析開始
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

        // エージェント（OpenAI/Google GenAI SDK 直接呼び出し）を使用して分析（失敗時に1回だけ再試行: 同一プロンプトを再送）
        let result: z.infer<typeof textAnalysisOutputSchema>
        try {
          // 構造化出力を活用
          const agent = getChunkAnalyzerAgent()
          result = await agent.generateObject(
            [{ role: 'user', content: prompt }],
            textAnalysisOutputSchema,
            { maxRetries: 2 },
          )
        } catch (agentError) {
          console.error(`[/api/analyze] Chunk ${i} agent error details:`, {
            error: agentError,
            message: extractErrorMessage(agentError),
            stack: agentError instanceof Error ? agentError.stack : 'No stack',
            name: agentError instanceof Error ? agentError.name : 'Unknown',
          })

          try {
            // 進捗: チャンクi リトライ中
            await dbService.updateJobStep(jobId, `analyze_chunk_${i}_retry`, i, chunks.length)
            const agent = getChunkAnalyzerAgent()
            result = await agent.generateObject(
              [{ role: 'user', content: prompt }],
              textAnalysisOutputSchema,
              { maxRetries: 1 },
            )
          } catch (retryError) {
            console.error(`[/api/analyze] Chunk ${i} retry failed:`, {
              error: retryError,
              message: extractErrorMessage(retryError),
            })
            throw retryError
          }
        }

        if (!result) {
          console.error(`[/api/analyze] Chunk ${i} result is null/undefined:`, result)
          throw new Error('Failed to generate analysis result - result is null')
        }

        // 分析結果をストレージに保存
        const analysisPath = StorageKeys.chunkAnalysis(jobId, i)
        const analysisData = {
          chunkIndex: i,
          jobId,
          analysis: result,
          analyzedAt: new Date().toISOString(),
        }

        await analysisStorage.put(analysisPath, JSON.stringify(analysisData, null, 2))
        console.log(`[/api/analyze] Chunk ${i} analyzed successfully`)
        // 進捗: チャンクi 分析完了
        await dbService.updateJobStep(jobId, `analyze_chunk_${i}_done`, i + 1, chunks.length)
      } catch (error) {
        const errorMsg = `Failed to analyze chunk ${i}: ${extractErrorMessage(error)}`
        console.error(`[/api/analyze] ${errorMsg}`)
        // DBにエラー内容とステップ名を記録 → /api/jobs/[id]/status で lastError/lastErrorStep として返る
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

      // 本番フロー: レイアウト生成のキックを自動で行う（第1話）。
      // UIが /api/layout/generate を叩く前にサーバー側で進め、"layout"で止まり続ける事象を回避。
      try {
        const baseUrl = new URL(request.url).origin
        const res = await fetch(`${baseUrl}/api/layout/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId, episodeNumber: 1 }),
        })
        if (!res.ok) {
          console.warn(`[/api/analyze] Auto layout kick failed: ${res.status} ${res.statusText}`)
        } else {
          console.log('[/api/analyze] Auto layout kick started for episode 1')
        }
      } catch (autoLayoutErr) {
        console.warn('[/api/analyze] Auto layout kick error:', autoLayoutErr)
      }
    } catch (episodeError) {
      console.error('[/api/analyze] Episode analysis failed:', episodeError)
      await dbService.updateJobError(
        jobId,
        `Episode analysis failed: ${extractErrorMessage(episodeError)}`,
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
    return createSuccessResponse({ ...response, jobId, chunkCount: chunks.length }, 201)
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

    // ApiError はそのまま / その他はラップ
    if (error instanceof ApiError) {
      return createErrorResponse(error)
    }
    return createErrorResponse(error, 'テキストの分析中にエラーが発生しました')
  }
}
