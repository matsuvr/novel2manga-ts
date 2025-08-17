/**
 * レートリミット関連のテスト補助関数
 */

export function isRateLimitAcceptable(status: number, data: unknown): boolean {
  // 一時的な外部依存の制限は許容（429: Too Many Requests, 503: Service Unavailable）
  if (status === 429 || status === 503) return true

  // 一部の実装では 500 にレート制限メッセージを含める場合があるため緩和（保険）
  const message =
    (typeof data === 'object' && data !== null && 'error' in (data as any)
      ? String((data as any).error)
      : '') || ''
  if (status === 500 && /rate|limit|quota|too\s*many\s*requests|over/i.test(message)) {
    return true
  }

  return false
}

export function explainRateLimit(data: unknown): string {
  const message =
    (typeof data === 'object' && data !== null && 'error' in (data as any)
      ? String((data as any).error)
      : '') || ''
  return message || 'Rate limited by upstream service'
}
