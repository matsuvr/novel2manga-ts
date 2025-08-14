import type { NextResponse } from 'next/server'
import { ERROR_CODES } from '@/utils/api-error'

type Body = any

export function isRateLimitAcceptable(status: number, body: Body): boolean {
  if (status === 429 && (body?.code === ERROR_CODES.RATE_LIMIT || /rate limit/i.test(body?.error))) {
    return true
  }
  if (status === 503 && body?.code === ERROR_CODES.RETRYABLE_ERROR) {
    return true
  }
  return false
}

export function explainRateLimit(body: Body): string {
  return typeof body?.error === 'string' ? body.error : 'Rate limited by provider'
}



