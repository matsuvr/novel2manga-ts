/**
 * Mock for @/server/auth/effectToApiResponse module
 *
 * Provides mocking for Effect-TS API response conversion and authentication wrapper
 */

import { Effect } from 'effect'
import { vi } from 'vitest'

// Re-export the ApiError and AuthenticationError from the main auth mock
export { ApiError, AuthenticationError } from './auth.mock'

// Mock authenticated user type
export interface AuthenticatedUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
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
      console.error('Mock effectToApiResponse error:', error)

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
  .mockImplementation(
    (
      handler: (user: AuthenticatedUser) => Effect.Effect<any, any>,
      _options?: { allowBypass?: boolean },
    ) => {
      // Return a function that can be called with a request
      return async (_request: Request) => {
        const mockUser: AuthenticatedUser = {
          id: 'mock-user-id',
          email: 'mock@example.com',
          name: 'Mock User',
          image: null,
        }

        try {
          const effect = handler(mockUser)
          return await effectToApiResponse(effect)
        } catch (error) {
          console.error('Mock withAuth error:', error)
          return new Response(
            JSON.stringify({
              error: {
                code: 'SERVER_ERROR',
                message: 'Authentication wrapper error',
              },
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }
    },
  )
