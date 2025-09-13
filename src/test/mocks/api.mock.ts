/**
 * Mock configuration for API modules
 * Provides consistent mocking for API error handling and response utilities
 */

import { Effect } from 'effect'
import { NextResponse } from 'next/server'
import { vi } from 'vitest'

// Mock ApiError class - matches the real implementation
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

// Mock AuthenticationError class
export class AuthenticationError extends Error {
  public readonly _tag = 'AuthenticationError'

  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

// Mock authenticated user type
export interface AuthenticatedUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
}

// Mock effectToApiResponse function
export const effectToApiResponse = vi
  .fn()
  .mockImplementation(async <T>(effect: Effect.Effect<T, any>) => {
    try {
      const result = await Effect.runPromise(effect)
      return NextResponse.json({ data: result })
    } catch (error) {
      console.error('API Effect Error:', error)

      if (error instanceof ApiError) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          },
          { status: error.status },
        )
      }

      if (
        error &&
        typeof error === 'object' &&
        '_tag' in error &&
        error._tag === 'AuthenticationError'
      ) {
        return NextResponse.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: (error as any).message,
            },
          },
          { status: 401 },
        )
      }

      // Handle other Effect error types
      if (error && typeof error === 'object' && '_tag' in error) {
        const errorTag = String(error._tag)

        switch (errorTag) {
          case 'DatabaseError':
            return NextResponse.json(
              {
                error: {
                  code: 'DATABASE_ERROR',
                  message: 'Database operation failed',
                },
              },
              { status: 500 },
            )

          case 'ValidationError':
            return NextResponse.json(
              {
                error: {
                  code: 'VALIDATION_ERROR',
                  message: 'Invalid input data',
                },
              },
              { status: 400 },
            )

          case 'JobNotFoundError':
            return NextResponse.json(
              {
                error: {
                  code: 'JOB_NOT_FOUND',
                  message: 'Job not found',
                },
              },
              { status: 404 },
            )

          default:
            return NextResponse.json(
              {
                error: {
                  code: 'UNKNOWN_ERROR',
                  message: `Unknown error: ${errorTag}`,
                },
              },
              { status: 500 },
            )
        }
      }

      // Fallback for unexpected errors
      return NextResponse.json(
        {
          error: {
            code: 'SERVER_ERROR',
            message: 'An unexpected error occurred',
          },
        },
        { status: 500 },
      )
    }
  })

// Mock withAuth function
export const withAuth = vi
  .fn()
  .mockImplementation(
    (
      handler: (user: AuthenticatedUser) => Effect.Effect<any, any>,
      _options?: { allowBypass?: boolean },
    ) => {
      return async (_request: Request) => {
        const mockUser: AuthenticatedUser = {
          id: 'mock-user-id',
          email: 'mock@example.com',
          name: 'Mock User',
          image: null,
        }

        const effect = handler(mockUser)
        return effectToApiResponse(effect)
      }
    },
  )

// Mock requireAuth function
export const requireAuth = Effect.gen(function* () {
  return {
    id: 'mock-user-id',
    email: 'mock@example.com',
    name: 'Mock User',
    image: null,
  } as AuthenticatedUser
})

// Mock requireAuthWithBypass function
export const requireAuthWithBypass = (searchParams?: URLSearchParams) =>
  Effect.gen(function* () {
    const isAdminBypass = searchParams?.get('admin') === 'true'
    const bypassEnabled = process.env.ALLOW_ADMIN_BYPASS === 'true'
    const isDevelopment = process.env.NODE_ENV === 'development'

    if (isAdminBypass && bypassEnabled && isDevelopment) {
      return {
        id: 'dev-user-bypass',
        email: 'dev@example.com',
        name: 'Development User',
        image: null,
      } as AuthenticatedUser
    }

    if (isAdminBypass && bypassEnabled && !isDevelopment) {
      yield* Effect.fail(
        new AuthenticationError('Admin bypass is not allowed in production environment'),
      )
    }

    return yield* requireAuth
  })

// Mock getSearchParamsFromRequest function
export const getSearchParamsFromRequest = (request: Request): URLSearchParams => {
  const url = new URL(request.url)
  return url.searchParams
}
