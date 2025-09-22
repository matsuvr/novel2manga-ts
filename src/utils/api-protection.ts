/**
 * API Protection utilities for handling authentication requirements
 * and graceful error responses for unauthenticated requests
 */

import type { NextRequest } from 'next/server'

/**
 * List of API routes that require authentication
 * These routes will be protected and require valid user sessions
 */
export const PROTECTED_ROUTES = [
  // Novel management
  '/api/novel',
  '/api/novel/db',
  '/api/novel/storage',

  // Job management
  '/api/jobs',
  '/api/job',
  '/api/analyze',
  '/api/resume',

  // Rendering
  '/api/render',
  '/api/layout/generate',

  // Export and sharing
  '/api/export',
  '/api/share',

  // User-specific data access
  '/api/render/status',
] as const

/**
 * List of API routes that are public and don't require authentication
 */
export const PUBLIC_ROUTES = [
  // Authentication endpoints
  '/api/login',
  '/api/logout',
  '/api/auth',

  // System monitoring (should be restricted in production)
  '/api/health',
  '/api/worker/health',

  // Documentation (public access)
  '/api/docs',

  // Debug endpoints (should be disabled in production)
  '/api/debug',
] as const

/**
 * Check if a route requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route))
}

/**
 * Check if a route is explicitly public
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

/**
 * Create a graceful error response for unauthenticated requests
 * Provides helpful information about authentication requirements
 */
export function createAuthRequiredResponse(request: NextRequest): Response {
  const { pathname } = new URL(request.url)

  // Check if this is an API request
  const isApiRequest = pathname.startsWith('/api/')

  if (isApiRequest) {
    // For API requests, return JSON error
    return json(
      {
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: '認証が必要です',
          details: {
            loginUrl: '/portal/auth/signin',
            requiredAction: 'ログインしてください',
            endpoint: pathname,
          },
        },
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer',
          'Content-Type': 'application/json',
        },
      },
    )
  }

  // For page requests, redirect to login
  const loginUrl = new URL('/portal/auth/signin', request.url)
  loginUrl.searchParams.set('callbackUrl', pathname)

  return Response.redirect(loginUrl)
}

/**
 * Create a graceful error response for forbidden requests (authenticated but not authorized)
 */
export function createForbiddenResponse(request: NextRequest, message?: string): Response {
  const { pathname } = new URL(request.url)

  return json(
    {
      error: {
        code: 'FORBIDDEN',
        message: message || 'アクセス権限がありません',
        details: {
          endpoint: pathname,
          requiredPermission: 'このリソースにアクセスする権限が必要です',
        },
      },
    },
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )
}

/**
 * Validate that debug endpoints are only accessible in development
 */
export function validateDebugAccess(request: NextRequest): boolean {
  const { pathname } = new URL(request.url)

  // Debug endpoints should only be accessible in development
  if (pathname.startsWith('/api/debug/')) {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  }

  return true
}

/**
 * Create response for disabled endpoints in production
 */
export function createEndpointDisabledResponse(): Response {
  return json(
    {
      error: {
        code: 'ENDPOINT_DISABLED',
        message: 'このエンドポイントは本番環境では無効です',
        details: {
          environment: process.env.NODE_ENV,
          reason: 'セキュリティ上の理由により、このエンドポイントは開発環境でのみ利用可能です',
        },
      },
    },
    { status: 403 },
  )
}

function json(
  body: unknown,
  init?: { status?: number; headers?: Record<string, string> },
): Response {
  const headers = new Headers({ 'Content-Type': 'application/json', ...(init?.headers ?? {}) })
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers })
}
