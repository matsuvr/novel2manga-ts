import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getLogger } from '@/infrastructure/logging/logger'
import { AnalyzePipeline } from '@/services/application/analyze-pipeline'
import { extractErrorMessage } from '@/utils/api-error'
import { ApiResponder } from '@/utils/api-responder'
import { detectDemoMode } from '@/utils/request-mode'
import { generateUUID } from '@/utils/uuid'

const analyzeRequestSchema = z
  .object({
    novelId: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    title: z.string().optional(),
    jobName: z.string().optional(),
    splitOnly: z.boolean().optional(),
  })
  .refine((d) => !!d.novelId || !!d.text, {
    message: 'novelId か text のいずれかが必要です',
    path: ['novelId'],
  })

export async function POST(request: NextRequest) {
  try {
    const _logger = getLogger().withContext({
      route: 'api/analyze',
      method: 'POST',
    })

    let rawBody: unknown
    try {
      rawBody = await request.json()
    } catch {
      return ApiResponder.validation('無効なJSONが送信されました')
    }

    const isDemo = detectDemoMode(request, rawBody)
    const parsed = analyzeRequestSchema.safeParse(rawBody)
    if (!parsed.success) {
      return ApiResponder.validation('リクエストボディが無効です', {
        issues: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      })
    }

    const { novelId: inputNovelId, text: inputText, title, splitOnly } = parsed.data

    let novelId = inputNovelId
    let novelText: string
    if (inputText) {
      novelText = inputText
      if (!novelId) novelId = generateUUID()
    } else if (inputNovelId) {
      // Novel テキストはサービス側で取得
      novelText = '__FETCH_FROM_STORAGE__'
      novelId = inputNovelId
    } else {
      return ApiResponder.validation('novelId か text が必要です')
    }

    const pipeline = new AnalyzePipeline()
    const safeNovelId = novelId as string
    const result =
      novelText === '__FETCH_FROM_STORAGE__'
        ? await pipeline.runWithNovelId(safeNovelId, {
            isDemo,
            splitOnly,
            title,
          })
        : await pipeline.runWithText(safeNovelId, novelText, {
            isDemo,
            splitOnly,
            title,
          })
    return ApiResponder.success(
      result.response ?? {
        success: true,
        jobId: result.jobId,
        chunkCount: result.chunkCount,
        message: 'Analysis completed',
      },
      201,
    )
  } catch (error) {
    const logger = getLogger().withContext({
      route: 'api/analyze',
      method: 'POST',
    })
    logger.error('Unhandled analyze error', {
      message: extractErrorMessage(error),
    })
    return ApiResponder.error(error, 'テキストの分析中にエラーが発生しました')
  }
}
