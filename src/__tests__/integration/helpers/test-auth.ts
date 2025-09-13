/**
 * Integration test authentication helper
 */

import { Effect } from 'effect'
import type { Session } from 'next-auth'

/**
 * Mock session for testing
 */
export function createMockSession(
  arg: string | { user?: { id?: string; email?: string; name?: string } } = 'test-user-id',
): Session {
  const userId = typeof arg === 'string' ? arg : (arg.user?.id ?? 'test-user-id')
  const email =
    typeof arg === 'string' ? 'test@example.com' : (arg.user?.email ?? 'test@example.com')
  const name = typeof arg === 'string' ? 'Test User' : (arg.user?.name ?? 'Test User')

  return {
    user: {
      id: userId,
      name,
      email,
      image: null,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
  }
}

/**
 * Mock auth function that returns a test session
 */
export function createMockAuth(session: Session | null = null) {
  return () => Promise.resolve(session || createMockSession())
}

/**
 * Create Effect that provides mock authentication
 */
export function createMockAuthEffect(userId: string = 'test-user-id') {
  return Effect.succeed(createMockSession(userId))
}

/**
 * Create Effect that simulates authentication failure
 */
export function createFailedAuthEffect() {
  return Effect.succeed(null)
}
