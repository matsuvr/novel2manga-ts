import { Effect } from 'effect'
import { AuthenticationError } from '@/utils/api-error'

// Re-export AuthenticationError for test compatibility
export { AuthenticationError }

/**
 * Authenticated user session data
 */
export interface AuthenticatedUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

/**
 * Effect that requires authentication and returns the authenticated user
 * Validates the session and returns user data or fails with AuthenticationError
 */
export const requireAuth = Effect.gen(function* () {
  try {
    // Dynamically import the auth function so vitest's module mock for '@/auth'
    // (set by tests with vi.mock) is applied reliably for both static and
    // dynamic mock scenarios. Support both named export `auth` and default
    // export shapes used across the codebase/tests.
    // Use a cached promise so the expensive module initialization (DB,
    // DrizzleAdapter, migrations) only runs once and can be pre-warmed at
    // startup. This prevents the first incoming request from paying the
    // full initialization latency.
    const authModule = yield* Effect.promise(() => getAuthModule())
    const authModuleUnknown = authModule as unknown
    const maybeAuth =
      (authModuleUnknown && typeof authModuleUnknown === 'object' && 'auth' in authModuleUnknown
        ? (authModuleUnknown as { auth: unknown }).auth
        : undefined) ??
      (authModuleUnknown && typeof authModuleUnknown === 'object' && 'default' in authModuleUnknown
        ? (authModuleUnknown as { default: unknown }).default
        : undefined) ??
      authModule
    const authFn: () => Promise<unknown> =
      typeof maybeAuth === 'function'
        ? (maybeAuth as () => Promise<unknown>)
        : maybeAuth &&
          typeof maybeAuth === 'object' &&
          'auth' in maybeAuth &&
          typeof (maybeAuth as { auth: unknown }).auth === 'function'
          ? () => (maybeAuth as { auth: () => Promise<unknown> }).auth()
          : () => Promise.reject(new Error('Auth function not found'))

    // Run the auth function and normalize any rejection into a prefixed Error so
    // the outer Effect.catch handler (and tests) can assert on a stable message.
    const session = yield* Effect.promise(async () => {
      try {
        return await authFn()
      } catch (err) {
        const msg =
          err && (err as { message?: unknown }).message
            ? String((err as { message?: unknown }).message)
            : String(err)
        // Development-time logging to aid debugging of authentication failures
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('[requireAuth] authFn failed:', msg)
        }
        throw new Error(`Failed to get session: ${msg}`)
      }
    })
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[requireAuth] authFn session result:', session)
    }

    const sess = session as unknown
    // Validate presence of user and that id is a non-empty, non-whitespace string
    const hasUser =
      sess &&
      typeof sess === 'object' &&
      'user' in (sess as Record<string, unknown>) &&
      (sess as unknown as Record<string, unknown>).user
    const rawId = hasUser
      ? ((sess as unknown as Record<string, unknown>).user as Record<string, unknown>).id
      : undefined
    const idIsString = typeof rawId === 'string'
    const idIsNonEmpty = idIsString && rawId.trim().length > 0

    if (!hasUser || !idIsString || !idIsNonEmpty) {
      if (process.env.NODE_ENV === 'development') {
        // eslint-disable-next-line no-console
        console.debug('[requireAuth] session did not contain user id', { sess })
      }
      return yield* Effect.fail(new AuthenticationError('Not authenticated'))
    }

    // Return authenticated user data (runtime-checked)
    const user = (sess as unknown as Record<string, unknown>).user as {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
    }
    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email ?? null,
      name: user.name ?? null,
      image: user.image ?? null,
    }

    return authenticatedUser
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return yield* Effect.fail(error)
    }

    // Ensure any other error is wrapped with the AuthenticationError and a
    // stable prefix so tests can assert on the beginning of the message.
    const maybeErr = error as unknown
    const message =
      maybeErr && (maybeErr as { message?: unknown }).message
        ? String((maybeErr as { message?: unknown }).message)
        : String(maybeErr)
    const normalized = message.startsWith('Failed to get session')
      ? message
      : `Failed to get session: ${message}`
    return yield* Effect.fail(new AuthenticationError(normalized))
  }
})

// Cache and optional pre-warm of the auth module. The auth module currently
// performs database/adapter initialization at import time which can be
// expensive on the first request. We keep a singleton promise so the import
// only happens once and can be triggered early (e.g. during server startup).
let cachedAuthModulePromise: Promise<unknown> | null = null

function getAuthModule(): Promise<unknown> {
  if (!cachedAuthModulePromise) {
    cachedAuthModulePromise = import('@/auth')
  }
  return cachedAuthModulePromise
}

// In development, start pre-warming the auth module immediately so the
// expensive initialization happens during server boot instead of the first
// HTTP request. Do not pre-warm in production to avoid surprising startup
// side-effects.
if (process.env.NODE_ENV === 'development') {
  void getAuthModule().catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[requireAuth] pre-warm of auth module failed:', err)
  })
}

/**
 * Development bypass functionality (controlled by environment)
 * Only works when ALLOW_ADMIN_BYPASS=true and admin=true query parameter is present
 * Completely disabled in production environments
 */
export const requireAuthWithBypass = (searchParams?: URLSearchParams) => {
  // No unconditional bypass for test environment; bypass must be enabled via ALLOW_ADMIN_BYPASS

  // Check if bypass is enabled and we're in development
  const allowBypass = process.env.ALLOW_ADMIN_BYPASS === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  const hasAdminParam = searchParams?.get('admin') === 'true'

  // Completely disable bypass in production
  if (isProduction && allowBypass) {
    return Effect.fail(
      new AuthenticationError('Admin bypass is not allowed in production environment'),
    )
  }

  // If bypass is requested and allowed in development
  if (allowBypass && hasAdminParam && !isProduction) {
    console.warn('⚠️  Authentication bypass used in development mode')

    // Return a mock authenticated user for development
    const mockUser: AuthenticatedUser = {
      id: 'dev-user-bypass',
      email: 'dev@example.com',
      name: 'Development User',
      image: null,
    }

    return Effect.succeed(mockUser)
  }

  // Otherwise, use normal authentication
  return requireAuth
}

/**
 * Helper to extract search params from a Next.js request
 */
export const getSearchParamsFromRequest = (request: Request): URLSearchParams => {
  const url = new URL(request.url)
  return url.searchParams
}
