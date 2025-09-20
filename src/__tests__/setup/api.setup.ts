/**
 * API Test Setup Configuration
 *
 * Configures mocks specifically for API route testing.
 * This setup is used in addition to unit.setup.ts for API-specific tests.
 */
import { vi } from 'vitest'

// Import mock implementations from centralized mock files
vi.mock('@/server/auth/effectToApiResponse', async () => {
  const { ApiError, effectToApiResponse } = await import('../mocks/api.mock')
  return {
    ApiError,
    effectToApiResponse,
  }
})

// Mock the main server auth module
vi.mock('@/server/auth', async () => {
  const {
    ApiError,
    AuthenticationError,
    effectToApiResponse,
    withAuth,
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
  } = await import('../mocks/auth.mock')

  return {
    ApiError,
    AuthenticationError,
    effectToApiResponse,
    withAuth,
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
  }
})

// Mock the server auth requireAuth module
vi.mock('@/server/auth/requireAuth', async () => {
  const { AuthenticationError, requireAuth, requireAuthWithBypass, getSearchParamsFromRequest } =
    await import('../mocks/auth.mock')

  return {
    AuthenticationError,
    requireAuth,
    requireAuthWithBypass,
    getSearchParamsFromRequest,
  }
})

// Mock the server auth effectToApiResponse module
vi.mock('@/server/auth/effectToApiResponse', async () => {
  const { ApiError, effectToApiResponse, withAuth } = await import('../mocks/auth.mock')

  return {
    ApiError,
    effectToApiResponse,
    withAuth,
  }
})

// Mock the utils api-auth module
vi.mock('@/utils/api-auth', async () => {
  const { withAuth, requireAuth, getSearchParamsFromRequest } = await import('../mocks/auth.mock')

  const getAuthenticatedUser = vi.fn().mockImplementation(() => requireAuth)

  const runWithAuth = vi.fn().mockImplementation(async (_request, effect) => {
    const mockUser = {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
    }

    try {
      const result = await effect(mockUser)
      return new Response(JSON.stringify({ data: result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (_error) {
      return new Response(
        JSON.stringify({
          error: { code: 'SERVER_ERROR', message: 'Internal server error' },
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
  })

  return {
    withAuth,
    getAuthenticatedUser,
    runWithAuth,
    getSearchParamsFromRequest,
  }
})

// Mock NextAuth
vi.mock('next-auth', () => ({
  default: vi.fn(),
  NextAuth: vi.fn(),
  getServerSession: vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  }),
}))

// Mock NextAuth providers
vi.mock('next-auth/providers/google', () => ({
  default: vi.fn(() => ({
    id: 'google',
    name: 'Google',
    type: 'oauth',
  })),
}))

// Mock the database module for API tests
vi.mock('@/db', async () => {
  // This test tree only provides a default export from database.mock
  const mod = await import('../mocks/database.mock')
  return {
    default: mod.default,
    // Provide minimal named exports used by API code under test if needed
    getDatabase: vi.fn(() => ({})),
    shouldRunMigrations: vi.fn(() => false),
    schema: {},
  }
})

// Mock the auth.ts module
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User',
      image: null,
    },
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
}))

// Mock database services for API tests
vi.mock('@/services/database', async () => {
  const {
    mockDatabase,
    mockDatabaseServiceFactory,
    mockInitializeDatabaseServiceFactory,
    mockGetDatabaseServiceFactory,
    mockIsFactoryInitialized,
    mockCleanup,
    MockDatabaseService,
  } = await import('../mocks/database-services.mock')

  return {
    db: mockDatabase,
    DatabaseServiceFactory: vi.fn().mockImplementation(() => mockDatabaseServiceFactory),
    initializeDatabaseServiceFactory: mockInitializeDatabaseServiceFactory,
    getDatabaseServiceFactory: mockGetDatabaseServiceFactory,
    isFactoryInitialized: mockIsFactoryInitialized,
    cleanup: mockCleanup,
    DatabaseService: MockDatabaseService,
  }
})

// Mock Next.js server components
vi.mock('next/server', async (importOriginal) => {
  const _actual = await importOriginal<typeof import('next/server')>()
  // Minimal Next server mock surface used in API tests
  return {
    NextRequest: vi.fn(),
    NextResponse: {
      json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => {
        return new Response(JSON.stringify(data), {
          status: init?.status ?? 200,
          headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
        })
      }),
      redirect: vi.fn(),
      rewrite: vi.fn(),
      next: vi.fn(),
    },
  }
})
