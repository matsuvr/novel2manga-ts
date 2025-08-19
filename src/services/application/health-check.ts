import { getDatabaseService } from '@/services/db-factory'
import { StorageFactory } from '@/utils/storage'

/**
 * 各コンポーネントのヘルスチェック結果。
 * `context` には失敗した操作名とタイムスタンプを含め、
 * 監視ログのトレースに利用する。
 */
export interface ErrorContext {
  operation: string
  timestamp: string
}

export interface ComponentStatus {
  /**
   * 'ok' when component responds without errors, otherwise 'error'.
   */
  status: 'ok' | 'error'
  latencyMs?: number
  error?: string
  context?: ErrorContext
}

export interface HealthResponse {
  status: 'ok' | 'error'
  version: string | null
  timestamp: string
  components: {
    database: ComponentStatus
    storage: ComponentStatus
  }
  env: 'development' | 'test' | 'production' | string
}

/**
 * データベースとストレージの軽量ヘルスチェックを行う。
 * - DB: 存在しないIDで読み取りを試行し、接続とクエリ経路を確認
 * - Storage: novels ストレージのルートを list して疎通を確認
 * 返却値の `status` は全コンポーネントの合否で決まる。
 */
export async function getHealthStatus(): Promise<HealthResponse> {
  const [dbStatus, storageStatus] = await Promise.all([checkDatabase(), checkStorage()])

  return {
    status: dbStatus.status === 'ok' && storageStatus.status === 'ok' ? 'ok' : 'error',
    version: process.env.npm_package_version || null,
    timestamp: new Date().toISOString(),
    components: { database: dbStatus, storage: storageStatus },
    env: process.env.NODE_ENV || 'unknown',
  }
}

async function checkDatabase(): Promise<ComponentStatus> {
  const start = performance.now()
  try {
    const db = getDatabaseService()
    // 軽量なメソッド呼び出し（存在しないID検索）で接続確認
    await db.getNovel('health-check-novel-id')
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) }
  } catch (e) {
    const context = { operation: 'database_health_check', timestamp: new Date().toISOString() }
    console.error('[HealthCheckService] Database check failed', {
      error: e instanceof Error ? e.message : String(e),
      context,
    })
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
      context,
    }
  }
}

async function checkStorage(): Promise<ComponentStatus> {
  const start = performance.now()
  try {
    // novels ストレージで list (ローカル / R2 双方対応)
    const novelStorage = await StorageFactory.getNovelStorage()
    await novelStorage.list?.('') // list が無い実装は考慮済み(現状あり)
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) }
  } catch (e) {
    const context = { operation: 'storage_health_check', timestamp: new Date().toISOString() }
    console.error('[HealthCheckService] Storage check failed', {
      error: e instanceof Error ? e.message : String(e),
      context,
    })
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
      context,
    }
  }
}
