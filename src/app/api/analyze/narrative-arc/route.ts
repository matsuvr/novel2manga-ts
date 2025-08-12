import type { NextRequest } from 'next/server'
// (No direct NextResponse usage; all responses via helpers)
import { z } from 'zod'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import type { EpisodeBoundary } from '@/types/episode'
import {
  ApiError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
  extractErrorMessage,
  ValidationError,
} from '@/utils/api-error'
import { prepareNarrativeAnalysisInput } from '@/utils/episode-utils'
import { saveEpisodeBoundaries } from '@/utils/storage'

const requestSchema = z.object({
  novelId: z.string(),
  jobId: z.string().optional(),
  startChunkIndex: z.number().int().min(0),
  targetChars: z.number().int().optional(),
  minChars: z.number().int().optional(),
  maxChars: z.number().int().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = requestSchema.parse(body)

    const input = await prepareNarrativeAnalysisInput({
      jobId: validatedData.jobId || validatedData.novelId, // jobIdが提供された場合はそれを使用、そうでなければnovelIdをフォールバック
      startChunkIndex: validatedData.startChunkIndex,
      targetChars: validatedData.targetChars,
      minChars: validatedData.minChars,
      maxChars: validatedData.maxChars,
    })

    if (!input) {
      // 旧仕様: { error, details } を返していたが他エンドポイントと統一
      // 理由: APIクライアント側の分岐削減 / 統一的な code ハンドリング
      // NOTE: このケースはフィールド単体ではなく入力範囲全体が不正 → INVALID_INPUT へ段階的移行予定
      return createErrorResponse(
        new ValidationError('Failed to prepare narrative analysis input', undefined, {
          reason: 'Not enough chunks available or invalid chunk range',
          code: ERROR_CODES.INVALID_INPUT,
        }),
      )
    }

    console.log(
      `Analyzing narrative arc for novel ${validatedData.novelId}, ` +
        `chunks ${input.chunks[0].chunkIndex}-${
          input.chunks[input.chunks.length - 1].chunkIndex
        }, ` +
        `total chars: ${input.chunks.reduce((sum, c) => sum + c.text.length, 0)}`,
    )

    let boundaries: EpisodeBoundary[]
    try {
      const chunkRepository = new StorageChunkRepository()
      boundaries = await analyzeNarrativeArc(input, chunkRepository)
    } catch (analysisError) {
      console.error('=== Narrative arc analysis failed ===')
      console.error('Novel ID:', validatedData.novelId)
      console.error('Input chunks:', input.chunks.length)
      console.error('Error:', analysisError)

      // エラーをそのまま上位に伝える（フォールバックなし）
      throw analysisError
    }

    // 分析に成功した場合のみ保存
    if (boundaries.length > 0) {
      await saveEpisodeBoundaries(validatedData.novelId, boundaries)
      console.log(
        `Saved ${boundaries.length} episode boundaries for novel ${validatedData.novelId}`,
      )
    } else {
      console.warn(
        `No boundaries found for novel ${validatedData.novelId} - not saving empty results`,
      )
    }

    const responseData = {
      novelId: validatedData.novelId,
      analyzedChunks: {
        start: input.chunks[0].chunkIndex,
        end: input.chunks[input.chunks.length - 1].chunkIndex,
        count: input.chunks.length,
      },
      totalChars: input.chunks.reduce((sum, c) => sum + c.text.length, 0),
      boundaries: boundaries.map((b) => ({
        ...b,
        charRange: {
          start: { chunk: b.startChunk, char: b.startCharIndex },
          end: { chunk: b.endChunk, char: b.endCharIndex },
        },
      })),
      suggestions:
        boundaries.length === 0
          ? [
              'No natural episode breaks found in this range',
              'Consider analyzing a larger text range',
              'The content might need manual division',
            ]
          : undefined,
    }

    return createSuccessResponse(responseData)
  } catch (error) {
    console.error('Narrative arc analysis error:', error)
    if (error instanceof z.ZodError) {
      // Zod エラー: 既に INVALID_INPUT を適用済 (コメント更新: 段階的 → 実装済)
      return createErrorResponse(
        new ValidationError('Invalid request data', undefined, {
          issues: error.errors,
          code: ERROR_CODES.INVALID_INPUT,
        }),
      )
    }
    if (error instanceof ApiError) {
      return createErrorResponse(error)
    }
    // レガシー互換: tests は error に固定メッセージ, details に元エラーを期待
    const original = extractErrorMessage(error)
    return createErrorResponse(
      new ApiError('Failed to analyze narrative arc', 500, ERROR_CODES.INTERNAL_ERROR, {
        original,
      }),
    )
  }
}
