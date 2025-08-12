import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { analyzeNarrativeArc } from '@/agents/narrative-arc-analyzer'
import { StorageChunkRepository } from '@/infrastructure/storage/chunk-repository'
import type { EpisodeBoundary } from '@/types/episode'
import { ApiError, createErrorResponse, createSuccessResponse } from '@/utils/api-error'
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
      // レガシー互換: tests は details に文字列を期待
      return NextResponse.json(
        {
          error: 'Failed to prepare narrative analysis input',
          details: 'Not enough chunks available or invalid chunk range',
        },
        { status: 400 },
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
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 },
      )
    }
    if (error instanceof ApiError) {
      return createErrorResponse(error)
    }
    // レガシー互換: tests は error に固定メッセージ, details に元エラーを期待
    return NextResponse.json(
      {
        error: 'Failed to analyze narrative arc',
        details:
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : String(error),
      },
      { status: 500 },
    )
  }
}
