/**
 * Mock configuration for authentication modules
 * Provides consistent mocking for API error handling and auth functions
 */

import { Effect } from 'effect'
import { vi } from 'vitest'

// Mock ApiError class
export class ApiError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status: number,
    public details?: any,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Mock AuthenticationError class - matches the real implementation
export class AuthenticationError {
  public readonly _tag = 'AuthenticationError'

  constructor(public readonly message: string) {
    this.name = 'AuthenticationError'
  }
}

// Mock authenticated user type
export interface AuthenticatedUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

// Create a dynamic mock auth function that uses the mocked auth service
const createMockRequireAuth = () =>
  Effect.gen(function* () {
    try {
      // Use dynamic import within the Effect context
      const authModule = yield* Effect.promise(() => import('@/auth'))
      const session = yield* Effect.tryPromise({
        try: () => authModule.auth(),
        catch: (error) => new AuthenticationError(`Failed to get session: ${String(error)}`),
      })

      if (!session?.user?.id) {
        return yield* Effect.fail(new AuthenticationError('Not authenticated'))
      }

      // Return authenticated user data
      const authenticatedUser: AuthenticatedUser = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name || null,
        image: session.user.image || null,
      }

      return authenticatedUser
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return yield* Effect.fail(error)
      }
      return yield* Effect.fail(new AuthenticationError(`Failed to get session: ${String(error)}`))
    }
  })

// Mock auth functions - these will be the actual implementations used in tests
export const requireAuth = createMockRequireAuth()

export const requireAuthWithBypass = (searchParams?: URLSearchParams) => {
  // Check if bypass is enabled and we're in development
  const allowBypass = process.env.ALLOW_ADMIN_BYPASS === 'true'
  const isProduction = process.env.NODE_ENV === 'production'
  const hasAdminParam = searchParams?.get('admin') === 'true'

  // Completely disable bypass in production
  if (isProduction && allowBypass && hasAdminParam) {
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

export const getSearchParamsFromRequest = (request: Request): URLSearchParams => {
  const url = new URL(request.url)
  return url.searchParams
}

// Mock effectToApiResponse function
export const effectToApiResponse = vi
  .fn()
  .mockImplementation(async (effect: Effect.Effect<any, any>) => {
    try {
      const result = await Effect.runPromise(effect)
      return new Response(JSON.stringify({ data: result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (error instanceof ApiError) {
        return new Response(
          JSON.stringify({
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          }),
          {
            status: error.status,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      if (error instanceof AuthenticationError) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: error.message,
            },
          }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      }

      return new Response(
        JSON.stringify({
          error: {
            code: 'SERVER_ERROR',
            message: 'An unexpected error occurred',
          },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  })

// Mock withAuth function for Effect-based API routes
export const withAuth = vi
  .fn()
  .mockImplementation((handler: (user: AuthenticatedUser) => Effect.Effect<any, any>) => {
    const requestHandler = async (_request: Request) => {
      const mockUser: AuthenticatedUser = {
        id: 'mock-user-id',
        email: 'mock@example.com',
        name: 'Mock User',
        image: null,
      }

      const effect = handler(mockUser)
      return effectToApiResponse(effect)
    }

    // Return the request handler function
    return requestHandler
  })
