import type { Effect as EffectType } from 'effect'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api-security', () => ({
  withSecurityEffect: (_config: unknown, handler: (req: NextRequest) => unknown) => {
    return async (request: NextRequest) => {
      const { Effect } = await import('effect')
      const eff = handler(request) as EffectType<unknown>
      const data = await Effect.runPromise(eff)
      return new Response(JSON.stringify({ data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  },
  SECURITY_CONFIGS: { authenticated: {} },
}))

vi.mock('@/server/auth/requireUser', async () => {
  const { Effect } = await import('effect')
  return { requireUser: Effect.succeed({ userId: 'user1' }) }
})

vi.mock('@/services/database/database-service-factory', () => ({
  db: {
    novels: () => ({ getAllNovels: () => Promise.resolve([{ id: 'n1', title: 'Novel1' }]) }),
    jobs: () => ({
      getJobsByUser: () => Promise.resolve([{ id: 'j1', novelId: 'n1', status: 'failed' }]),
    }),
    outputs: () => ({ getOutputsByUserId: () => Promise.resolve([]) }),
  },
}))

describe('/api/mypage/dashboard', () => {
  it('returns job summaries', async () => {
    const { GET } = await import('@/app/api/mypage/dashboard/route')
    const request = new NextRequest('http://localhost/api/mypage/dashboard')
    const response = await GET(request)
    const json = await response.json()
    expect(json.data.jobs).toHaveLength(1)
    expect(json.data.jobs[0]).toMatchObject({ id: 'j1', novelId: 'n1', status: 'failed' })
  })
})
