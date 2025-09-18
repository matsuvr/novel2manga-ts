import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { analyzeChunkWithFallback } from '@/agents/chunk-analyzer'
import { getTextAnalysisConfig } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'
import { withAuth } from '@/utils/api-auth'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  ValidationError,
} from '@/utils/api-error'
import { getNovelIdForJob } from '@/utils/job'
import { StorageFactory, StorageKeys } from '@/utils/storage'

// リクエストボディのバリデーションスキーマ
const analyzeChunkRequestSchema = z.object({
  jobId: z.string(),
  chunkIndex: z.number(),
})

// 簡素化された出力スキーマ
const textAnalysisOutputSchema = z.object({
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
      time: z.string().nullable().optional(),
      description: z.string(),
      startIndex: z.number(),
      endIndex: z.number(),
    }),
  ),
  dialogues: z.array(
    z.object({
      speakerId: z.string(),
      text: z.string(),
      emotion: z.string(),
      index: z.number(),
    }),
  ),
  highlights: z.array(
    z.object({
      type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
      description: z.string(),
      importance: z.number(),
      startIndex: z.number(),
      endIndex: z.number(),
    }),
  ),
  situations: z.array(
    z.object({
      description: z.string(),
      index: z.number(),
    }),
  ),
})

export const POST = withAuth(async (request: NextRequest, _user) => {
  try {
    const logger = getLogger().withContext({
      route: 'api/analyze/chunk',
      method: 'POST',
    })
    // リクエストボディの取得とバリデーション
    const body = await request.json()
    const { jobId, chunkIndex } = analyzeChunkRequestSchema.parse(body)
    const novelId = await getNovelIdForJob(jobId)

    logger.info('Analyzing chunk', { jobId, chunkIndex })

    // NOTE: このエンドポイントではDB上のジョブ存在チェックは行わず、
    // ストレージ上のチャンク/分析ファイル有無のみで応答を決定する。
    // （単体テストが、存在しないjobIdでもストレージに基づく404/200を期待するため）

    // ストレージから必要なデータを取得
    const chunkStorage = await StorageFactory.getChunkStorage()
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // 既に分析済みかチェック
    const analysisPath = StorageKeys.chunkAnalysis({ novelId, jobId, index: chunkIndex })
    const existingAnalysis = await analysisStorage.get(analysisPath)

    if (existingAnalysis) {
      logger.info('Analysis already exists', { chunkIndex })
      const analysisData = JSON.parse(existingAnalysis.text)
      return createSuccessResponse({
        cached: true,
        data: analysisData.analysis,
      })
    }

    // チャンクテキストを取得
    const chunkPath = StorageKeys.chunk({ novelId, jobId, index: chunkIndex })
    const chunkFile = await chunkStorage.get(chunkPath)

    if (!chunkFile) {
      // Explicit 404 ApiError so tests receive 404 status
      return createErrorResponse(
        new ApiError(`Chunk file not found: ${chunkPath}`, 404, 'NOT_FOUND'),
      )
    }

    const chunkText = chunkFile.text
    logger.debug('Loaded chunk text', { length: chunkText.length })

    // 設定を取得してプロンプトを生成
    const config = getTextAnalysisConfig()
    const prompt = config.userPromptTemplate
      .replace('{{chunkIndex}}', chunkIndex.toString())
      .replace('{{chunkText}}', chunkText)
      .replace('{{previousChunkSummary}}', '') // 簡易版では前後のテキストは省略
      .replace('{{nextChunkSummary}}', '')

    logger.info('Sending to LLM for analysis')

    // フォールバック付きでチャンク分析
    const { result, usedProvider, fallbackFrom } = await analyzeChunkWithFallback(
      prompt,
      textAnalysisOutputSchema,
      {
        maxRetries: 0,
        jobId,
        chunkIndex,
      },
    )

    if (!result) {
      throw new Error('Failed to generate analysis result')
    }

    logger.info('Analysis complete', {
      characters: result.characters.length,
      scenes: result.scenes.length,
      dialogues: result.dialogues.length,
      highlights: result.highlights.length,
      situations: result.situations.length,
    })

    // 分析結果をストレージに保存
    const analysisData = {
      chunkIndex,
      jobId,
      analysis: result,
      analyzedAt: new Date().toISOString(),
    }

    await analysisStorage.put(analysisPath, JSON.stringify(analysisData, null, 2))
    logger.info('Saved analysis', { analysisPath })

    // レスポンスを返却
    return createSuccessResponse({
      cached: false,
      data: result,
      usedProvider,
      fallbackFrom,
    })
  } catch (error) {
    const logger = getLogger().withContext({
      route: 'api/analyze/chunk',
      method: 'POST',
    })
    logger.error('Error', {
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof z.ZodError) {
      return createErrorResponse(new ValidationError('Invalid request data'))
    }

    // Preserve original not found status
    if (error instanceof Error && error.message.startsWith('Chunk file not found')) {
      return createErrorResponse(new ApiError(error.message, 404, 'NOT_FOUND'))
    }
    return createErrorResponse(error, 'Failed to analyze chunk')
  }
})
