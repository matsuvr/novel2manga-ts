/**
 * API Security Middleware
 * Combines validation, rate limiting, and security measures
 */

import type { Effect } from 'effect'
import { type NextRequest, NextResponse } from 'next/server'
import { ApiError } from '@/server/auth/effectToApiResponse'
import {
  parseJsonBody,
  REQUEST_SIZE_LIMITS,
  type ValidationSchema,
  validateData,
  validateRequestSize,
} from './api-validation'
import { applyRateLimit, getRateLimitStatus } from './rate-limiting'

/**
 * Security configuration for API endpoints
 */
export interface SecurityConfig {
  rateLimit?: {
    requests: number
    windowMs: number
  }
  maxBodySize?: number
  validation?: {
    body?: ValidationSchema
    query?: ValidationSchema
  }
  requireAuth?: boolean
}

/**
 * Security headers to add to responses
 */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'",
} as const

/**
 * Add security headers to response
 */
export function addSecurityHeaders<T = unknown>(response: NextResponse<T>): NextResponse<T> {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  return response
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders<T = unknown>(
  response: NextResponse<T>,
  request: NextRequest,
  config: { requests: number; windowMs: number },
): NextResponse {
  try {
    const status = getRateLimitStatus(request, config)
    response.headers.set('X-RateLimit-Limit', config.requests.toString())
    response.headers.set('X-RateLimit-Remaining', status.remaining.toString())
    response.headers.set('X-RateLimit-Reset', status.resetTime)
  } catch (error) {
    // Don't fail the request if rate limit headers can't be added
    console.warn('Failed to add rate limit headers:', error)
  }
  return response
}

/**
 * Validate query parameters
 */
export function validateQueryParams(
  request: NextRequest,
  schema: ValidationSchema,
): Record<string, unknown> {
  const { searchParams } = new URL(request.url)
  const params: Record<string, unknown> = {}

  // Convert search params to object
  for (const [key, value] of searchParams.entries()) {
    const rule = schema[key]
    if (rule) {
      switch (rule.type) {
        case 'number':
          params[key] = Number(value)
          break
        case 'boolean':
          params[key] = value === 'true'
          break
        default:
          params[key] = value
      }
    }
  }

  validateData(params, schema, request)
  return params
}

/**
 * Security middleware for API routes
 */
export function withSecurity(config: SecurityConfig = {}) {
  return async function securityMiddleware(
    request: NextRequest,
    handler: (
      request: NextRequest,
      validatedData?: { body?: unknown; query?: Record<string, unknown> },
    ) => Promise<NextResponse>,
  ): Promise<NextResponse> {
    try {
      // Apply rate limiting
      if (config.rateLimit) {
        applyRateLimit(request, config.rateLimit)
      }

      // Validate request size
      if (config.maxBodySize) {
        validateRequestSize(request, config.maxBodySize)
      }

      const validatedData: { body?: unknown; query?: Record<string, unknown> } = {}

      // Validate request body if schema provided
      if (config.validation?.body && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const body = await parseJsonBody(
          request,
          config.maxBodySize || REQUEST_SIZE_LIMITS.JSON_BODY,
        )
        validateData(body, config.validation.body, request)
        validatedData.body = body
      }

      // Validate query parameters if schema provided
      if (config.validation?.query) {
        const query = validateQueryParams(request, config.validation.query)
        validatedData.query = query
      }

      // Call the actual handler
      let response = await handler(request, validatedData)

      // Add security headers
      response = addSecurityHeaders(response)

      // Add rate limit headers
      if (config.rateLimit) {
        response = addRateLimitHeaders(response, request, config.rateLimit)
      }

      return response
    } catch (error) {
      console.error('Security middleware error:', error)

      if (error instanceof ApiError) {
        let response: NextResponse<unknown> = NextResponse.json(
          {
            error: {
              code: error.code,
              message: error.message,
              details: error.details,
            },
          },
          { status: error.status },
        )

        // Add security headers even to error responses
        response = addSecurityHeaders(response)

        // Add rate limit headers if applicable
        if (config.rateLimit && error.code === 'RATE_LIMIT_EXCEEDED') {
          response = addRateLimitHeaders(response, request, config.rateLimit)
        }

        return response
      }

      // Unexpected error
      let response: NextResponse<unknown> = NextResponse.json(
        {
          error: {
            code: 'SERVER_ERROR',
            message: 'サーバーエラーが発生しました',
          },
        },
        { status: 500 },
      )

      response = addSecurityHeaders(response)
      return response
    }
  }
}

/**
 * Effect TS compatible security wrapper
 */
export function withSecurityEffect<T, E>(
  config: SecurityConfig,
  effect: (
    request: NextRequest,
    validatedData?: { body?: unknown; query?: Record<string, unknown> },
  ) => Effect.Effect<T, E>,
) {
  return (request: NextRequest) => {
    return withSecurity(config)(request, async (req, validatedData) => {
      const { effectToApiResponse } = await import('@/server/auth/effectToApiResponse')
      return effectToApiResponse(effect(req, validatedData))
    })
  }
}

/**
 * Common security configurations
 */
export const SECURITY_CONFIGS = {
  // Default security for public endpoints
  public: {
    rateLimit: { requests: 100, windowMs: 15 * 60 * 1000 },
    maxBodySize: REQUEST_SIZE_LIMITS.JSON_BODY,
  },

  // Stricter security for authenticated endpoints
  authenticated: {
    rateLimit: { requests: 60, windowMs: 15 * 60 * 1000 },
    maxBodySize: REQUEST_SIZE_LIMITS.JSON_BODY,
    requireAuth: true,
  },

  // Very strict security for sensitive operations
  sensitive: {
    rateLimit: { requests: 10, windowMs: 15 * 60 * 1000 },
    maxBodySize: REQUEST_SIZE_LIMITS.JSON_BODY / 10, // 1MB
    requireAuth: true,
  },

  // Security for file upload endpoints
  upload: {
    rateLimit: { requests: 20, windowMs: 60 * 60 * 1000 },
    maxBodySize: REQUEST_SIZE_LIMITS.FORM_DATA,
    requireAuth: true,
  },
} as const
