import type { NextRequest } from 'next/server'
import { getDatabaseService } from '@/services/db-factory'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'
import { StorageFactory } from '@/utils/storage'

interface ComponentStatus {
  status: 'ok' | 'error'
  latencyMs?: number
  error?: string
}

interface HealthResponseBody {
  status: 'ok' | 'error'
  version: string | null
  timestamp: string
  components: {
    database: ComponentStatus
    storage: ComponentStatus
  }
  env: 'development' | 'test' | 'production' | string
}

async function checkDatabase(): Promise<ComponentStatus> {
  const start = performance.now()
  try {
    const db = getDatabaseService()
    // 軽量なメソッド呼び出し（存在しないID検索）で接続確認
    await db.getNovel('health-check-novel-id')
    return { status: 'ok', latencyMs: Math.round(performance.now() - start) }
  } catch (e) {
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
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
    return {
      status: 'error',
      latencyMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function GET(_req: NextRequest) {
  try {
    const [dbStatus, storageStatus] = await Promise.all([checkDatabase(), checkStorage()])

    const overall: HealthResponseBody = {
      status: dbStatus.status === 'ok' && storageStatus.status === 'ok' ? 'ok' : 'error',
      version: process.env.npm_package_version || null,
      timestamp: new Date().toISOString(),
      components: { database: dbStatus, storage: storageStatus },
      env: process.env.NODE_ENV || 'unknown',
    }

    const httpStatus = overall.status === 'ok' ? 200 : 503
    return createSuccessResponse(overall, httpStatus)
  } catch (error) {
    return createErrorResponse(error, 'Health check failed')
  }
}

// NOTE: POST/other methods reserved for future self-diagnostic triggers.
