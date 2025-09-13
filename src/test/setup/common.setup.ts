/**
 * Common Test Setup Configuration
 *
 * Shared setup utilities and patterns for all test types.
 * This file provides common test utilities that can be used
 * across unit, integration, and API tests.
 */

import { beforeEach, expect, vi } from 'vitest'

// Mock types for stronger typing in test helpers
export type MockUser = {
  id: string
  email: string
  name: string
  image: string | null
  createdAt: string
  emailNotifications: boolean
  theme: 'light' | 'dark'
  language: string
}

export type MockJob = {
  id: string
  userId: string
  novelId: string
  status: string
  createdAt: string
  updatedAt: string
}

export type MockNovel = {
  id: string
  userId: string
  title: string
  author: string
  createdAt: string
  updatedAt: string
}

/**
 * Test environment configuration
 */
export const setupTestEnvironment = () => {
  // Set consistent test environment variables
  process.env.NODE_ENV = 'test'
  process.env.LOG_LEVEL = 'warn'
  process.env.DB_SKIP_MIGRATE = '0'

  // Suppress console output during tests unless explicitly needed
  if (!process.env.VITEST_VERBOSE) {
    vi.spyOn(console, 'log').mockImplementation(() => {
      // Suppress console.log in tests
    })
    vi.spyOn(console, 'info').mockImplementation(() => {
      // Suppress console.info in tests
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {
      // Suppress console.warn in tests
    })
    // Keep console.error for debugging test failures
  }
}

/**
 * Mock cleanup utilities
 */
export const resetAllMocks = () => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  vi.restoreAllMocks()
}

/**
 * Common mock patterns for consistent testing
 */
export const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: 'mock-user-id',
  email: 'mock@example.com',
  name: 'Mock User',
  image: null,
  createdAt: new Date().toISOString(),
  emailNotifications: true,
  theme: 'light',
  language: 'ja',
  ...overrides,
})

export const createMockJob = (overrides: Partial<MockJob> = {}): MockJob => ({
  id: 'mock-job-id',
  userId: 'mock-user-id',
  novelId: 'mock-novel-id',
  status: 'pending',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

export const createMockNovel = (overrides: Partial<MockNovel> = {}): MockNovel => ({
  id: 'mock-novel-id',
  userId: 'mock-user-id',
  title: 'Mock Novel',
  author: 'Mock Author',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

/**
 * Mock request/response utilities for API tests
 */
export const createMockRequest = (
  options: {
    method?: string
    url?: string
    body?: unknown
    headers?: Record<string, string>
  } = {},
) => {
  const { method = 'GET', url = 'http://localhost:3000/api/test', body, headers = {} } = options

  const request = new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  // Add mock methods for testing
  Object.defineProperty(request, 'json', {
    value: vi.fn().mockResolvedValue(body || {}),
    writable: true,
  })

  return request
}

export const createMockResponse = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Error testing utilities
 */
export const expectApiError = async (
  response: Response,
  expectedCode: string,
  expectedStatus = 400,
) => {
  expect(response.status).toBe(expectedStatus)
  const data = await response.json()
  expect(data.error).toBeDefined()
  expect(data.error.code).toBe(expectedCode)
  return data.error
}

export const expectSuccessResponse = async (response: Response, expectedStatus = 200) => {
  expect(response.status).toBe(expectedStatus)
  const data = await response.json()
  expect(data.error).toBeUndefined()
  return data
}

/**
 * Database mock configuration helpers
 */
export const configureDatabaseMocks = (
  scenario: 'empty' | 'withUser' | 'withJob' | 'complete' = 'empty',
) => {
  // This will be implemented based on the specific mock configuration needed
  // for different test scenarios
  switch (scenario) {
    case 'withUser':
      // Configure mocks to return a user
      break
    case 'withJob':
      // Configure mocks to return a job with user
      break
    case 'complete':
      // Configure mocks for complete workflow
      break
    default:
      // Empty state - no data returned
      break
  }
}

/**
 * Test timeout utilities
 */
export const TEST_TIMEOUTS = {
  UNIT: 5000, // 5 seconds for unit tests
  API: 10000, // 10 seconds for API tests
  INTEGRATION: 30000, // 30 seconds for integration tests
  E2E: 60000, // 60 seconds for E2E tests
} as const

/**
 * Test data factories for consistent test data creation
 */
export const TestDataFactory = {
  user: createMockUser,
  job: createMockJob,
  novel: createMockNovel,

  // Create related data sets
  userWithJobs: (userOverrides = {}, jobCount = 2) => {
    const user = createMockUser(userOverrides)
    const jobs = Array.from({ length: jobCount }, (_, i) =>
      createMockJob({
        userId: user.id,
        id: `${user.id}-job-${i + 1}`,
      }),
    )
    return { user, jobs }
  },

  completeWorkflow: (
    overrides: {
      user?: Partial<MockUser>
      novel?: Partial<MockNovel>
      job?: Partial<MockJob>
    } = {},
  ) => {
    const user = createMockUser(overrides.user || {})
    const novel = createMockNovel({ userId: user.id, ...(overrides.novel || {}) })
    const job = createMockJob({
      userId: user.id,
      novelId: novel.id,
      ...(overrides.job || {}),
    })

    return { user, novel, job }
  },
}

/**
 * Setup function to be called in test setup files
 */
export const setupCommonTestEnvironment = () => {
  setupTestEnvironment()

  // Global test setup that applies to all test types
  beforeEach(() => {
    resetAllMocks()
  })
}

// Re-export vitest utilities for convenience
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest'
