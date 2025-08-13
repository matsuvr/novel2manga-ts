import type { NextRequest } from 'next/server'
import { z } from 'zod'

// デモモード要求の最小判定用スキーマ（any禁止のためsafeParseで検出）
const zDemoFlag = z.object({ mode: z.literal('demo') })

export function detectDemoMode(request: NextRequest, body: unknown): boolean {
  const hasQuery = new URL(request.url).searchParams.get('demo') === '1'
  const hasBody = zDemoFlag.safeParse(body).success
  return hasQuery || hasBody
}
