import type { NextRequest } from 'next/server'
import { getLogger } from '@/infrastructure/logging/logger'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { createEndpointDisabledResponse, validateDebugAccess } from '@/utils/api-protection'

export async function GET(request: NextRequest) {
  // Check if debug endpoints are allowed in current environment
  if (!validateDebugAccess(request)) {
    return createEndpointDisabledResponse()
  }

  try {
    const logger = getLogger().withContext({
      route: 'api/debug/env',
      method: 'GET',
    })

    // 環境変数の状態をチェック
    const envState = {
      VERTICAL_TEXT_API_URL: {
        set: !!process.env.VERTICAL_TEXT_API_URL,
        value: process.env.VERTICAL_TEXT_API_URL
          ? `${process.env.VERTICAL_TEXT_API_URL.substring(0, 30)}...`
          : 'NOT_SET',
      },
      VERTICAL_TEXT_API_KEY: {
        set: !!process.env.VERTICAL_TEXT_API_KEY,
        value: process.env.VERTICAL_TEXT_API_KEY
          ? `${process.env.VERTICAL_TEXT_API_KEY.substring(0, 10)}...`
          : 'NOT_SET',
      },
      VERTICAL_TEXT_API_TOKEN: {
        set: !!process.env.VERTICAL_TEXT_API_TOKEN,
        value: process.env.VERTICAL_TEXT_API_TOKEN
          ? `${process.env.VERTICAL_TEXT_API_TOKEN.substring(0, 10)}...`
          : 'NOT_SET',
      },
      NODE_ENV: process.env.NODE_ENV,
    }

    // 縦書きAPIクライアントの読み込みテスト
    type ClientTest = {
      status: 'unknown' | 'success' | 'failed'
      error: string | null
      imageSize?: number
    }
    let clientTest: ClientTest = { status: 'unknown', error: null }
    try {
      const { renderVerticalText } = await import('@/services/vertical-text-client')

      // 簡単なAPIテスト
      const result = await renderVerticalText({
        text: 'テスト',
        fontSize: 16,
      })

      clientTest = { status: 'success', error: null, imageSize: result.pngBuffer.length }
    } catch (error: unknown) {
      clientTest = {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }

    logger.info('Environment debug check', { envState, clientTest })

    return createSuccessResponse({
      timestamp: new Date().toISOString(),
      environment: envState,
      verticalTextClient: clientTest,
    })
  } catch (error) {
    return createErrorResponse(error)
  }
}
