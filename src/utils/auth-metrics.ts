type MetricsEvent = 'auth' | 'auth:GET' | 'auth:POST' | 'auth:signIn' | 'auth:signOut'

interface EventDataBase {
  ms: number
  path?: string
  status?: number
}

function normalizeEnv(val: unknown): string {
  if (typeof val === 'string') return val.trim().toLowerCase()
  return ''
}

export function authMetricsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const val = normalizeEnv(env.AUTH_METRICS)
  if (!val) return false
  // より柔軟な真偽値解釈を許容（利便性向上）。既存の '1' は後方互換で維持。
  return val === '1' || val === 'true' || val === 'yes' || val === 'on'
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

export function measure<T>(
  fn: () => Promise<T> | T,
): Promise<{ ms: number; value: T }> | { ms: number; value: T } {
  const start = nowMs()
  const result = fn()
  if (result instanceof Promise) {
    return result.then((value) => ({ ms: nowMs() - start, value }))
  }
  return { ms: nowMs() - start, value: result }
}

export function logAuthMetric(event: MetricsEvent, data: EventDataBase): void {
  if (!authMetricsEnabled()) return
  const payload = {
    event,
    ms: Number.isFinite(data.ms) ? Number(data.ms.toFixed(2)) : data.ms,
    path: data.path,
    status: data.status,
    ts: new Date().toISOString(),
  }
  // 情報レベルのため console.log を使用（フォールバック禁止方針: 失敗は上位でthrowされる前提）
  // eslint-disable-next-line no-console
  console.log('[auth-metrics]', payload)
}
