import type { NextRequest } from 'next/server'
import { z } from 'zod'

// デモモード要求の最小判定用スキーマ（any禁止のためsafeParseで検出）
const zDemoFlag = z.object({ mode: z.literal('demo') })

/**
 * detectDemoMode
 * - 判定優先度: クエリ (?demo=1) > ボディ ({ mode: 'demo' })
 * - どちらかが成立すれば true
 */
export function detectDemoMode(request: NextRequest, body: unknown): boolean {
  const hasQuery = new URL(request.url).searchParams.get('demo') === '1'
  if (hasQuery) return true
  return zDemoFlag.safeParse(body).success
}
