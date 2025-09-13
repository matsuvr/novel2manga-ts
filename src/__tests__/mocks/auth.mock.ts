// Local test mock for auth utilities (do NOT re-export legacy copies to avoid duplicate exports)
// Intentionally do not re-export default to avoid duplicate default exports.

import { Effect } from 'effect'
import { vi } from 'vitest'

export class ApiError extends Error {
  status: number
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = 500
  }
}

export class AuthenticationError extends ApiError {
  constructor(message = 'Authentication required') {
    super(message)
    this.name = 'AuthenticationError'
    this.status = 401
  }
}

export const effectToApiResponse = (err: unknown) => ({ status: 500, body: String(err) })

export const withAuth = <T extends (...args: unknown[]) => unknown>(handler: T): T => handler

// Export requireAuth as an Effect so code that yields `requireAuth` works correctly.
export const requireAuth = Effect.succeed({ id: 'user-123' })

export const requireAuthWithBypass = (searchParams?: URLSearchParams) => {
  if (searchParams && searchParams.get && searchParams.get('bypass') === 'true') {
    return Effect.succeed({ id: 'test-user-bypass' })
  }
  return Effect.succeed({ id: 'user-123' })
}

export const getSearchParamsFromRequest = (_req: unknown) => new URLSearchParams('')

export default {
  ApiError,
  AuthenticationError,
  effectToApiResponse,
  withAuth,
  requireAuth,
  requireAuthWithBypass,
  getSearchParamsFromRequest,
}
