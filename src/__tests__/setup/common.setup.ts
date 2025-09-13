/**
 * Common Test Setup Configuration
 *
 * Shared setup utilities and patterns for all test types.
 */

import { beforeEach, expect, vi } from 'vitest'

/**
 * Test environment configuration
 */
export const setupTestEnvironment = () => {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
  ;(process.env as Record<string, string | undefined>).LOG_LEVEL = 'warn'
  ;(process.env as Record<string, string | undefined>).DB_SKIP_MIGRATE = '0'

  if (!process.env.VITEST_VERBOSE) {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  }
}

export const resetAllMocks = () => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  vi.restoreAllMocks()
}

export const createMockUser = (overrides = {}) => ({
  id: 'mock-user-id',
  email: 'mock@example.com',
  name: 'Mock User',
  image: null,
  createdAt: new Date().toISOString(),
  emailNotifications: true,
  theme: 'light' as const,
  language: 'ja' as const,
  ...overrides,
})

export const createMockJob = (overrides = {}) => ({
  id: 'mock-job-id',
  userId: 'mock-user-id',
  novelId: 'mock-novel-id',
  status: 'pending' as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

export const createMockNovel = (overrides = {}) => ({
  id: 'mock-novel-id',
  userId: 'mock-user-id',
  title: 'Mock Novel',
  author: 'Mock Author',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

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

  Object.defineProperty(request, 'json', {
    value: vi.fn().mockResolvedValue((body as unknown) || {}),
    writable: true,
  })

  return request
}

export const createMockResponse = (data: unknown, status = 200) => {
  return new Response(JSON.stringify(data as unknown), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

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

export const configureDatabaseMocks = (
  scenario: 'empty' | 'withUser' | 'withJob' | 'complete' = 'empty',
) => {
  switch (scenario) {
    case 'withUser':
      break
    case 'withJob':
      break
    case 'complete':
      break
    default:
      break
  }
}

export const TEST_TIMEOUTS = {
  UNIT: 5000,
  API: 10000,
  INTEGRATION: 30000,
  E2E: 60000,
} as const

export const TestDataFactory = {
  user: createMockUser,
  job: createMockJob,
  novel: createMockNovel,
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
      user?: Record<string, unknown>
      novel?: Record<string, unknown>
      job?: Record<string, unknown>
    } = {},
  ) => {
    const user = createMockUser(overrides.user)
    const novel = createMockNovel({ userId: user.id, ...(overrides.novel ?? {}) })
    const job = createMockJob({
      userId: user.id,
      novelId: novel.id,
      ...(overrides.job ?? {}),
    })

    return { user, novel, job }
  },
}

export const setupCommonTestEnvironment = () => {
  setupTestEnvironment()
  beforeEach(() => {
    resetAllMocks()
  })
}

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test, vi } from 'vitest'
