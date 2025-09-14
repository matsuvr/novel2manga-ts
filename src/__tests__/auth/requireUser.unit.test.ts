import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

describe('requireUser', () => {
  it('returns userId when authenticated', async () => {
    vi.doMock('@/server/auth/requireAuth', () => ({
      requireAuth: Effect.succeed({ id: 'user-123' }),
    }))
    const { requireUser } = await import('@/server/auth/requireUser')
    const result = await Effect.runPromise(requireUser)
    expect(result.userId).toBe('user-123')
  })

  it('fails when authentication fails', async () => {
    class AuthenticationError extends Error { _tag = 'AuthenticationError' }
    vi.doMock('@/server/auth/requireAuth', () => ({
      requireAuth: Effect.fail(new AuthenticationError('no auth')),
      AuthenticationError,
    }))
    const { requireUser } = await import('@/server/auth/requireUser')
    await expect(Effect.runPromise(requireUser)).rejects.toBeInstanceOf(
      AuthenticationError,
    )
  })
})
