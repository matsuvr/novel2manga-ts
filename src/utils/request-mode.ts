import type { NextRequest } from 'next/server'
import { z } from 'zod'

// デモモード要求の最小判定用スキーマ（any禁止のためsafeParseで検出）
const zDemoFlag = z.object({ mode: z.literal('demo') })

/**
 * デモモードの検出（優先度: クエリ > ボディ）
 * 
 * Detects demo mode from either query parameter or request body.
 * Query parameter takes precedence over body property.
 * 
 * @param request - NextRequest object containing URL and headers
 * @param body - Request body (unknown type) to be safely parsed
 * @returns true if demo mode detected via ?demo=1 query or {mode: "demo"} body, false otherwise
 */
export function detectDemoMode(request: NextRequest, body: unknown): boolean {
  const hasQuery = new URL(request.url).searchParams.get('demo') === '1'
  if (hasQuery) return true
  return zDemoFlag.safeParse(body).success
}
