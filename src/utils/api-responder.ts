import type { NextResponse } from 'next/server'
import {
  AuthenticationError,
  createErrorResponse,
  createSuccessResponse,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from './api-error'

export const ApiResponder = {
  success<T extends Record<string, unknown> | unknown>(data: T, status = 200): NextResponse {
    return createSuccessResponse(data, status)
  },
  error(err: unknown, defaultMessage?: string): NextResponse {
    return createErrorResponse(err, defaultMessage)
  },
  validation(message: string, details?: Record<string, unknown>): NextResponse {
    return createErrorResponse(new ValidationError(message, undefined, details))
  },
  notFound(resource: string): NextResponse {
    return createErrorResponse(new NotFoundError(resource))
  },
  forbidden(message = 'アクセス権限がありません'): NextResponse {
    return createErrorResponse(new ForbiddenError(message))
  },
  auth(message = '認証が必要です'): NextResponse {
    return createErrorResponse(new AuthenticationError(message))
  },
}

export type { NextResponse }
