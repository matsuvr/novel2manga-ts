import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import {
  type AuthenticatedUser,
  getSearchParamsFromRequest,
  requireAuthWithBypass,
} from '@/server/auth/requireAuth'
import { AuthenticationError, createErrorResponse } from '@/utils/api-error'

/**
 * Utility to handle authentication in API routes using Effect TS
 * Returns the authenticated user or throws an authentication error
 */
export const getAuthenticatedUser = (
  request: NextRequest,
): Effect.Effect<AuthenticatedUser, AuthenticationError> => {
  // In unit tests, bypass auth entirely to focus on route logic
  if (process.env.NODE_ENV === 'test') {
    const user: AuthenticatedUser = {
      id: 'test-user-bypass',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
    }
    return Effect.succeed(user)
  }

  const searchParams = getSearchParamsFromRequest(request)

  return requireAuthWithBypass(searchParams).pipe(
    Effect.mapError((error) => {
      if (error instanceof AuthenticationError) {
        return new AuthenticationError((error as Error).message)
      }
      return new AuthenticationError('Authentication failed')
    }),
  )
}

/**
 * Higher-order function to wrap API route handlers with authentication
 * Automatically handles authentication and passes the authenticated user to the handler
 */
export function withAuth<A = unknown>(
  handler: (
    request: NextRequest,
    user: { id: string; email?: string | null; name?: string | null },
    ...args: A[]
  ) => Promise<Response>,
) {
  return async (request: NextRequest, ...args: A[]): Promise<Response> => {
    try {
      // In unit tests, skip auth entirely to avoid noise
      if (process.env.NODE_ENV === 'test') {
        const testUser = { id: 'test-user-bypass', email: 'test@example.com', name: 'Test User' }
        return await handler(request, testUser, ...args)
      }
      const user = await Effect.runPromise(getAuthenticatedUser(request))
      return await handler(request, user, ...args)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return createErrorResponse(error)
      }
      return createErrorResponse(new AuthenticationError('Authentication required'))
    }
  }
}

/**
 * Utility to run an Effect with authentication and convert to NextResponse
 * Handles both authentication errors and other Effect errors
 */
export const runWithAuth = <E, A>(
  request: NextRequest,
  effect: (user: {
    id: string
    email?: string | null
    name?: string | null
  }) => Effect.Effect<A, E>,
): Promise<Response> => {
  return Effect.runPromise(
    getAuthenticatedUser(request).pipe(
      Effect.flatMap(effect),
      Effect.map(
        (result) =>
          new Response(JSON.stringify({ data: result }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
      Effect.catchAll((error) => {
        if (error instanceof AuthenticationError) {
          return Effect.succeed(createErrorResponse(error))
        }
        // Handle other errors appropriately
        return Effect.succeed(createErrorResponse(error as Error))
      }),
    ),
  )
}
