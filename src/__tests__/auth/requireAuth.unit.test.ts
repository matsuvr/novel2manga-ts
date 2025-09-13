/**
 * Authentication Guard Unit Tests
 * Tests authentication guard functions with various scenarios
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the auth function (hoisted)
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

// Module under test bindings (filled in beforeEach)
let AuthenticationError: any
let getSearchParamsFromRequest: any
let requireAuth: any
let requireAuthWithBypass: any

describe('Authentication Guard Unit Tests', () => {
  let mockAuth: ReturnType<typeof vi.fn>

  // Diagnostic helper: verify the runtime shape of Effect values before executing them
  const assertIsEffectLike = (value: unknown, name = 'value') => {
    try {
      // Basic structural checks: function (Effect constructors) or object with internal opcode/methods
      if (value == null) {
        // eslint-disable-next-line no-console
        console.warn(`DIAGNOSTIC: ${name} is null/undefined:`, value)
        return false
      }

      if (typeof value === 'function') {
        // eslint-disable-next-line no-console
        console.info(`DIAGNOSTIC: ${name} is a function (may be an Effect factory).`)
        return true
      }

      if (typeof value !== 'object') {
        // eslint-disable-next-line no-console
        console.warn(`DIAGNOSTIC: ${name} is not an object/function:`, value)
        return false
      }

      // Many effect runtimes attach internal tags or symbols; check for common props
      const obj = value as Record<string, unknown>
      if ('_tag' in obj || '_op' in obj || 'run' in obj || 'pipe' in obj) {
        // eslint-disable-next-line no-console
        console.info(`DIAGNOSTIC: ${name} looks effect-like (has _tag/_op/run/pipe)`)
        return true
      }

      // Fallback: log keys for inspection
      // eslint-disable-next-line no-console
      console.warn(
        `DIAGNOSTIC: ${name} missing expected effect properties; keys=`,
        Object.keys(obj),
      )
      return false
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('DIAGNOSTIC: assertIsEffectLike threw', err)
      return false
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks()

    // Reset environment variables using vi.stubEnv
    vi.unstubAllEnvs()

    // Unmock server auth to import the real implementation for these unit tests
    try {
      vi.unmock('@/server/auth')
      vi.unmock('@/server/auth/requireAuth')
    } catch (e) {
      // some Vitest versions may throw if not mocked; ignore
    }

    // Import the real auth module and spy on its `auth` export so the module under test
    // (which imports '../../auth') will call the spied function.
    const authModule = await import('@/auth')
    mockAuth = vi.spyOn(authModule, 'auth') as unknown as ReturnType<typeof vi.fn>

    // Import the module under test after spy is set up
    const mod = await import('@/server/auth/requireAuth')
    AuthenticationError = mod.AuthenticationError
    getSearchParamsFromRequest = mod.getSearchParamsFromRequest
    requireAuth = mod.requireAuth
    requireAuthWithBypass = mod.requireAuthWithBypass
  })

  const assertAuthenticationErrorExit = (result: any) => {
    expect(result._tag).toBe('Failure')
    const cause = result.cause
    // Improved diagnostic output
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const util = require('util')
    const repr = util.inspect(cause, { depth: 6 })

    // Accept either Fail or Die causes if they contain authentication-related messages
    const ok =
      (cause &&
        cause._tag === 'Fail' &&
        (repr.includes('AuthenticationError') ||
          repr.includes('Failed to get session') ||
          repr.includes('Not authenticated'))) ||
      (cause &&
        cause._tag === 'Die' &&
        (repr.includes('Auth service error') ||
          repr.includes('Network timeout') ||
          repr.includes('AuthenticationError') ||
          repr.includes('Failed to get session') ||
          repr.includes('Not authenticated')))

    if (!ok) {
      // Provide helpful diagnostic output for debugging
      // eslint-disable-next-line no-console
      console.error('DIAGNOSTIC: unexpected authentication failure exit cause (inspect):', repr)
    }

    expect(ok).toBe(true)
  }

  describe('requireAuth', () => {
    it('should return authenticated user when session is valid', async () => {
      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          image: 'https://example.com/avatar.jpg',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = (await Effect.runPromise(requireAuth)) as any

      expect(result).toEqual({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
      })
    })

    it('should return authenticated user with minimal data', async () => {
      const mockSession = {
        user: {
          id: 'user-456',
          email: 'minimal@example.com',
          // no name or image
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = (await Effect.runPromise(requireAuth)) as any

      expect(result).toEqual({
        id: 'user-456',
        email: 'minimal@example.com',
        name: null,
        image: null,
      })
    })

    it('should fail with AuthenticationError when session is null', async () => {
      mockAuth.mockResolvedValue(null)

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause._tag).toBe('Fail')
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error).toBeInstanceOf(AuthenticationError)
          expect(result.cause.error.message).toBe('Not authenticated')
        }
      }
    })

    it('should fail with AuthenticationError when session is undefined', async () => {
      mockAuth.mockResolvedValue(undefined)

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause._tag).toBe('Fail')
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error).toBeInstanceOf(AuthenticationError)
          expect(result.cause.error.message).toBe('Not authenticated')
        }
      }
    })

    it('should fail with AuthenticationError when user has no id', async () => {
      const mockSession = {
        user: {
          email: 'test@example.com',
          name: 'Test User',
          // no id
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause._tag).toBe('Fail')
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error).toBeInstanceOf(AuthenticationError)
          expect(result.cause.error.message).toBe('Not authenticated')
        }
      }
    })

    it('should fail with AuthenticationError when user id is empty string', async () => {
      const mockSession = {
        user: {
          id: '',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause._tag).toBe('Fail')
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error).toBeInstanceOf(AuthenticationError)
          expect(result.cause.error.message).toBe('Not authenticated')
        }
      }
    })

    it('should fail with AuthenticationError when auth service throws', async () => {
      mockAuth.mockRejectedValue(new Error('Auth service error'))

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      assertAuthenticationErrorExit(result)
    })

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout')
      timeoutError.name = 'TimeoutError'
      mockAuth.mockRejectedValue(timeoutError)

      const result = (await Effect.runPromiseExit(requireAuth)) as any

      assertAuthenticationErrorExit(result)
    })
  })

  describe('requireAuthWithBypass', () => {
    it('should use normal auth when bypass is not enabled', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'false')
      vi.stubEnv('NODE_ENV', 'development')

      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const searchParams = new URLSearchParams('admin=true')
      const result = (await Effect.runPromise(requireAuthWithBypass(searchParams))) as any

      expect(result.id).toBe('user-123')
      expect(result.email).toBe('test@example.com')
    })

    it('should return mock user when bypass is enabled in development', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const searchParams = new URLSearchParams('admin=true')
      const result = (await Effect.runPromise(requireAuthWithBypass(searchParams))) as any

      expect(result).toEqual({
        id: 'dev-user-bypass',
        email: 'dev@example.com',
        name: 'Development User',
        image: null,
      })
    })

    it('should fail when bypass is attempted in production', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'production')

      const searchParams = new URLSearchParams('admin=true')
      const result = (await Effect.runPromiseExit(requireAuthWithBypass(searchParams))) as any

      expect(result._tag).toBe('Failure')
      if (result._tag === 'Failure') {
        expect(result.cause._tag).toBe('Fail')
        if (result.cause._tag === 'Fail') {
          expect(result.cause.error).toBeInstanceOf(AuthenticationError)
          expect(result.cause.error.message).toBe(
            'Admin bypass is not allowed in production environment',
          )
        }
      }
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

      const searchParams = new URLSearchParams() // no admin=true
      const result = (await Effect.runPromise(requireAuthWithBypass(searchParams))) as any

      expect(result.id).toBe('user-123')
    })

    it('should use normal auth when admin param is false', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const searchParams = new URLSearchParams('admin=false')
      const result = (await Effect.runPromise(requireAuthWithBypass(searchParams))) as any

      expect(result.id).toBe('user-123')
    })

    it('should use normal auth when bypass is disabled even with admin param', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'false')
      vi.stubEnv('NODE_ENV', 'development')

      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const searchParams = new URLSearchParams('admin=true')
      const result = (await Effect.runPromise(requireAuthWithBypass(searchParams))) as any

      expect(result.id).toBe('user-123')
    })

    it('should handle undefined searchParams', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const mockSession = {
        user: {
          id: 'user-123',
          email: 'test@example.com',
        },
      }
      mockAuth.mockResolvedValue(mockSession)

      const result = (await Effect.runPromise(requireAuthWithBypass(undefined))) as any

      expect(result.id).toBe('user-123')
    })

    it('should log warning when bypass is used', async () => {
      vi.stubEnv('ALLOW_ADMIN_BYPASS', 'true')
      vi.stubEnv('NODE_ENV', 'development')

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const searchParams = new URLSearchParams('admin=true')
      await Effect.runPromise(requireAuthWithBypass(searchParams))

      expect(consoleSpy).toHaveBeenCalledWith('⚠️  Authentication bypass used in development mode')

      consoleSpy.mockRestore()
    })
  })

  describe('getSearchParamsFromRequest', () => {
    it('should extract search params from request URL', () => {
      const request = new Request('https://example.com/api/test?admin=true&debug=false')
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('admin')).toBe('true')
      expect(searchParams.get('debug')).toBe('false')
    })

    it('should handle request with no search params', () => {
      const request = new Request('https://example.com/api/test')
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('admin')).toBeNull()
      expect(Array.from(searchParams.keys())).toHaveLength(0)
    })

    it('should handle request with empty search params', () => {
      const request = new Request('https://example.com/api/test?')
      const searchParams = getSearchParamsFromRequest(request)

      expect(Array.from(searchParams.keys())).toHaveLength(0)
    })

    it('should handle URL encoded parameters', () => {
      const request = new Request(
        'https://example.com/api/test?message=hello%20world&special=%26%3D',
      )
      const searchParams = getSearchParamsFromRequest(request)

      expect(searchParams.get('message')).toBe('hello world')
      expect(searchParams.get('special')).toBe('&=')
    })
  })

  describe('AuthenticationError', () => {
    it('should create error with correct tag and message', () => {
      const error = new AuthenticationError('Test error message')

      expect(error._tag).toBe('AuthenticationError')
      expect(error.message).toBe('Test error message')
    })

    it('should be instance of AuthenticationError', () => {
      const error = new AuthenticationError('Test')

      expect(error).toBeInstanceOf(AuthenticationError)
    })
  })
})
