/**
 * Authentication Test Utilities
 *
 * Provides utilities for testing authentication flows, error handling,
 * and mock user creation for consistent auth testing across the application.
 */

import { Effect } from 'effect'
import { expect, vi } from 'vitest'

/**
 * Authentication error class for testing
 * Matches the structure of the real AuthenticationError
 */
export class TestAuthenticationError {
  readonly _tag = 'AuthenticationError'

  constructor(readonly message: string) {
    this.name = 'AuthenticationError'
  }
}

/**
 * Authenticated user interface for testing
 */
export interface TestAuthenticatedUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
}

/**
 * Mock session data structure
 */
export interface TestSession {
  user: {
    id?: string
    email?: string | null
    name?: string | null
    image?: string | null
  }
}

/**
 * Authentication test utilities class
 */
export const AuthTestUtils = {
  /**
   * Create a mock authenticated user for testing
   */
  createMockUser(overrides: Partial<TestAuthenticatedUser> = {}): TestAuthenticatedUser {
    return {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      ...overrides,
    }
  },

  /**
   * Create a mock session for testing
   */
  createMockSession(userOverrides: Partial<TestAuthenticatedUser> = {}): TestSession {
    const user = AuthTestUtils.createMockUser(userOverrides)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      },
    }
  },

  /**
   * Create a mock session with no user ID (for testing auth failures)
   */
  createInvalidSession(): TestSession {
    return {
      user: {
        email: 'test@example.com',
        name: 'Test User',
        // no id - this should cause auth to fail
      },
    }
  },

  /**
   * Create a mock auth function that can be controlled in tests
   */
  createMockAuth() {
    return vi.fn().mockResolvedValue(AuthTestUtils.createMockSession())
  },

  /**
   * Configure mock auth to return a specific session
   */
  configureMockAuth(mockAuth: ReturnType<typeof vi.fn>, session: TestSession | null) {
    mockAuth.mockResolvedValue(session)
  },

  /**
   * Configure mock auth to throw an error
   */
  configureMockAuthError(mockAuth: ReturnType<typeof vi.fn>, error: Error) {
    mockAuth.mockRejectedValue(error)
  },

  /**
   * Test helper to expect an authentication error
   */
  async expectAuthError(
    effect: Effect.Effect<unknown, unknown, unknown>,
    expectedMessage?: string,
  ): Promise<TestAuthenticationError> {
    try {
      const runEffect = Effect.runPromise as unknown as (
        eff: Effect.Effect<unknown, unknown, unknown>,
      ) => Promise<unknown>
      await runEffect(effect as unknown as Effect.Effect<unknown, unknown, unknown>)
      throw new Error('Expected authentication error but effect succeeded')
    } catch (error) {
      if (expectedMessage) {
        expect(error).toHaveProperty('message', expectedMessage)
      }
      return error as TestAuthenticationError
    }
  },

  /**
   * Test helper to expect successful authentication
   */
  async expectAuthSuccess(
    effect: Effect.Effect<TestAuthenticatedUser, unknown, unknown>,
  ): Promise<TestAuthenticatedUser> {
    // Use typed wrapper to avoid broad any
    const runEffect = Effect.runPromise as unknown as (
      eff: Effect.Effect<unknown, unknown, unknown>,
    ) => Promise<unknown>
    return (await runEffect(
      effect as unknown as Effect.Effect<unknown, unknown, unknown>,
    )) as TestAuthenticatedUser
  },

  /**
   * Create environment variables for bypass testing
   */
  setupBypassEnvironment(
    allowBypass: boolean = true,
    nodeEnv: 'development' | 'production' = 'development',
  ) {
    vi.stubEnv('ALLOW_ADMIN_BYPASS', allowBypass ? 'true' : 'false')
    vi.stubEnv('NODE_ENV', nodeEnv)
  },

  /**
   * Create search params for bypass testing
   */
  createBypassParams(admin: boolean = true): URLSearchParams {
    const params = new URLSearchParams()
    if (admin) {
      params.set('admin', 'true')
    }
    return params
  },

  /**
   * Mock NextAuth configuration for testing
   */
  createNextAuthMock() {
    return {
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
      handlers: {
        GET: vi.fn(),
        POST: vi.fn(),
      },
    }
  },

  /**
   * Mock authentication middleware for API testing
   */
  createAuthMiddlewareMock() {
    return {
      requireAuth: vi.fn().mockImplementation(() => Effect.succeed(AuthTestUtils.createMockUser())),
      requireAuthWithBypass: vi
        .fn()
        .mockImplementation(() => Effect.succeed(AuthTestUtils.createMockUser())),
      withAuth: vi.fn().mockImplementation((handler) => async (request: Request) => {
        const mockUser = AuthTestUtils.createMockUser()
        return handler(mockUser, request)
      }),
    }
  },

  /**
   * Reset all authentication mocks
   */
  resetMocks() {
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  },
}
/**
 * Common test scenarios for authentication
 */
export const AuthTestScenarios = {
  /**
   * Valid user session
   */
  validSession: AuthTestUtils.createMockSession({
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    image: 'https://example.com/avatar.jpg',
  }),

  /**
   * Session with no user ID (should fail auth)
   */
  invalidSession: AuthTestUtils.createInvalidSession(),

  /**
   * Null session (user not logged in)
   */
  nullSession: null,

  /**
   * Development bypass user
   */
  bypassUser: {
    id: 'dev-user-bypass',
    email: 'dev@example.com',
    name: 'Development User',
    image: null,
  },
}
