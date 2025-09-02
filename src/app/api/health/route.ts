import type { NextRequest } from 'next/server'
import { getHealthStatus } from '@/services/application/health-check'

export const runtime = 'nodejs'

// 監視用途のヘルスチェック。DB/Storage の軽量疎通を行い、詳細を返す。
export async function GET(_req: NextRequest) {
  const health = await getHealthStatus()
  const statusCode = health.status === 'ok' ? 200 : 503
  return Response.json(health, {
    status: statusCode,
    headers: {
      'cache-control': 'no-cache, no-store, must-revalidate',
      pragma: 'no-cache',
      expires: '0',
    },
  })
}
