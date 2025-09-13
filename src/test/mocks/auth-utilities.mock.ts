/**
 * Authentication Utilities Mock
 *
 * Provides comprehensive mocking for authentication utilities,
 * error handling, and middleware functions used across the application.
 */

import { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { vi } from 'vitest'

// Re-export the main auth mock classes and interfaces
export { ApiError, AuthenticatedUser, AuthenticationError } from './auth.mock'

/**
 * Mock authentication middleware utilities
 */
export const createAuthMiddlewareMocks = () => {
  const mockRequireAuth = vi.fn().mockImplementation(() =>
    Effect.succeed({
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    }),
  )

  const mockRequireAuthWithBypass = vi.fn().mockImplementation((searchParams?: URLSearchParams) => {
    const isAdminBypass = searchParams?.get('admin') === 'true'
    const bypassEnabled = process.env.ALLOW_ADMIN_BYPASS === 'true'
    const isDevelopment = process.env.NODE_ENV === 'development'

    if (isAdminBypass && bypassEnabled && isDevelopment) {
      return Effect.succeed({
        id: 'dev-user-bypass',
        email: 'dev@example.com',
        name: 'Development User',
        image: null,
      })
    }

    if (isAdminBypass && bypassEnabled && !isDevelopment) {
      return Effect.fail(new Error('Admin bypass is not allowed in production environment'))
    }

    return mockRequireAuth()
  })

  const mockGetSearchParamsFromRequest = vi.fn().mockImplementation((request: Request) => {
    const url = new URL(request.url)
    return url.searchParams
  })

  const mockWithAuth = vi.fn().mockImplementation((handler) => {
    return async (request: NextRequest) => {
      const mockUser = {
        id: 'mock-user-id',
        email: 'mock@example.com',
        name: 'Mock User',
        image: null,
      }

      try {
        const result = await handler(mockUser, request)
        return result
      } catch (_error) {
        return NextResponse.json(
          { error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
          { status: 500 },
        )
      }
    }
  })

  return {
    requireAuth: mockRequireAuth,
    requireAuthWithBypass: mockRequireAuthWithBypass,
    getSearchParamsFromRequest: mockGetSearchParamsFromRequest,
    withAuth: mockWithAuth,
  }
}

/**
 * Mock NextAuth server utilities
 */
export const createNextAuthServerMocks = () => {
  const mockGetServerSession = vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  })

  const mockAuth = vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  })

  return {
    getServerSession: mockGetServerSession,
    auth: mockAuth,
  }
}

/**
 * Mock authentication error utilities
 */
export const createAuthErrorMocks = () => {
  const mockHandleAuthError = vi.fn().mockImplementation((error: Error) => {
    if (error.message.includes('Not authenticated')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 },
      )
    }

    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'Internal server error' } },
      { status: 500 },
    )
  })

  const mockIsAuthenticationError = vi.fn().mockImplementation((error: any) => {
    return error && (error._tag === 'AuthenticationError' || error.name === 'AuthenticationError')
  })

  return {
    handleAuthError: mockHandleAuthError,
    isAuthenticationError: mockIsAuthenticationError,
  }
}

/**
 * Complete authentication mock setup for API tests
 */
export const setupAuthMocksForApi = () => {
  const authMocks = createAuthMiddlewareMocks()
  const nextAuthMocks = createNextAuthServerMocks()
  const errorMocks = createAuthErrorMocks()

  return {
    ...authMocks,
    ...nextAuthMocks,
    ...errorMocks,
  }
}

/**
 * Complete authentication mock setup for unit tests
 */
export const setupAuthMocksForUnit = () => {
  const authMocks = createAuthMiddlewareMocks()
  const errorMocks = createAuthErrorMocks()

  return {
    ...authMocks,
    ...errorMocks,
  }
}

/**
 * Reset all authentication mocks
 */
export const resetAuthMocks = () => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
}
