/**
 * Authentication Module Tests
 *
 * Tests for authentication functions including requireAuth, requireAuthWithBypass,
 * and utility functions. These tests verify proper error handling, bypass functionality,
 * and integration with NextAuth.
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth function before importing the module
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({
  auth: mockAuth,
}))

// Import after mocking to ensure mocks are applied
const { AuthenticationError } = await import('@/server/auth/requireAuth')

describe('Authentication Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  describe('AuthenticationError', () => {
    it('should create an AuthenticationError with correct properties', () => {
      const error = new AuthenticationError('Test error message')

      expect(error._tag).toBe('AuthenticationError')
      expect(error.message).toBe('Test error message')
    })

    it('should be an instance of AuthenticationError', () => {
      const error = new AuthenticationError('Test error')

      expect(error).toBeInstanceOf(AuthenticationError)
      expect(error._tag).toBe('AuthenticationError')
    })
  })

  describe('Authentication Flow Integration', () => {
    it('should handle valid session data correctly', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          image: 'https://example.com/avatar.jpg',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      // Import the function after setting up the mock
      const { requireAuth } = await import('@/server/auth/requireAuth')
      const result = await Effect.runPromise(requireAuth)

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
      })
    })

    it('should handle null session correctly', async () => {
      mockAuth.mockResolvedValue(null)

      const { requireAuth } = await import('@/server/auth/requireAuth')

      await expect(Effect.runPromise(requireAuth)).rejects.toThrow('Not authenticated')
    })

    it('should handle session without user ID', async () => {
      const mockSession = {
        user: {
          email: 'test@example.com',
          name: 'Test User',
          // no id
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const { requireAuth } = await import('@/server/auth/requireAuth')

      await expect(Effect.runPromise(requireAuth)).rejects.toThrow('Not authenticated')
    })

    it('should handle auth service errors', async () => {
      mockAuth.mockRejectedValue(new Error('Auth service error'))

      const { requireAuth } = await import('@/server/auth/requireAuth')

      await expect(Effect.runPromise(requireAuth)).rejects.toThrow('Failed to get session')
    })
  })

  describe('Bypass Functionality', () => {
    it('should return bypass user in development with admin param', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const { requireAuthWithBypass } = await import('@/server/auth/requireAuth')
      const searchParams = new URLSearchParams('admin=true')
      const result = await Effect.runPromise(requireAuthWithBypass(searchParams))

      expect(result).toEqual({
        id: 'dev-user-bypass',
        email: 'dev@example.com',
        name: 'Development User',
        image: null,
      })
    })

    it('should reject bypass in production', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'production')

      const { requireAuthWithBypass } = await import('@/server/auth/requireAuth')
      const searchParams = new URLSearchParams('admin=true')

      await expect(Effect.runPromise(requireAuthWithBypass(searchParams))).rejects.toThrow(
        'Admin bypass is not allowed in production environment',
      )
    })

    it('should use normal auth when admin param is not present', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const { requireAuthWithBypass } = await import('@/server/auth/requireAuth')
      const searchParams = new URLSearchParams() // no admin=true
      const result = await Effect.runPromise(requireAuthWithBypass(searchParams))

      expect(result.id).toBe('user-123')
    })

    it('should use normal auth when bypass is not enabled', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const { requireAuthWithBypass } = await import('@/server/auth/requireAuth')
      const searchParams = new URLSearchParams('admin=true')
      const result = await Effect.runPromise(requireAuthWithBypass(searchParams))

      expect(result.id).toBe('user-123')
    })
  })

  describe('Utility Functions', () => {
    it('should extract search params from request URL', async () => {
      const { getSearchParamsFromRequest } = await import('@/server/auth/requireAuth')
      const request = new Request('https://example.com/api/test?admin=true&debug=false')
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('admin')).toBe('true')
      expect(searchParams.get('debug')).toBe('false')
    })

    it('should handle request with no search params', async () => {
      const { getSearchParamsFromRequest } = await import('@/server/auth/requireAuth')
      const request = new Request('https://example.com/api/test')
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('admin')).toBeNull()
    })

    it('should handle request with empty search params', async () => {
      const { getSearchParamsFromRequest } = await import('@/server/auth/requireAuth')
      const request = new Request('https://example.com/api/test?')
      const searchParams = getSearchParamsFromRequest(request)

      expect(Array.from(searchParams.keys())).toHaveLength(0)
    })

    it('should handle URL encoded parameters', async () => {
      const { getSearchParamsFromRequest } = await import('@/server/auth/requireAuth')
      const request = new Request(
        'https://example.com/api/test?message=hello%20world&special=%26%3D',
      )
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('message')).toBe('hello world')
      expect(searchParams.get('special')).toBe('&=')
    })
  })
})
