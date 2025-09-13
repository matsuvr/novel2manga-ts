// Clean minimal unit test setup — single, small, and syntactically correct.
import { beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.clearAllMocks()
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
  ;(process.env as Record<string, string | undefined>).LOG_LEVEL = 'warn'
})

// Proxy mocks that re-export canonical mocks from the legacy backup
vi.mock('../mocks/database.mock', async () => await import('../mocks/database.mock'))
vi.mock(
  '../mocks/database-services.mock',
  async () => await import('../mocks/database-services.mock'),
)
// Also mock by resolved module id so tests that call `vi.mock(import('@/services/database'), ...)`
// or importOriginal against '@/services/database' find the expected mocked exports.
vi.mock('@/services/database', async () => await import('../mocks/database-services.mock'))
vi.mock('../mocks/auth.mock', async () => await import('../mocks/auth.mock'))
// Also register the module-id mock so imports of '@/server/auth' get the mock reliably
vi.mock('@/server/auth', async () => await import('../mocks/auth.mock'))
vi.mock(
  '../mocks/effectToApiResponse.mock',
  async () => await import('../mocks/effectToApiResponse.mock'),
)
// next-auth and provider shims
vi.mock('../mocks/next-auth.react.mock', async () => await import('../mocks/next-auth.react.mock'))
vi.mock('../mocks/next-auth.mock', async () => await import('../mocks/next-auth.mock'))
vi.mock(
  '../mocks/next-auth.providers.google.mock',
  async () => await import('../mocks/next-auth.providers.google.mock'),
)
// Ensure database-service-factory dynamic imports resolve to our unit mock
vi.mock(
  '../mocks/database-service-factory.mock',
  async () => await import('../mocks/database-service-factory.mock'),
)
vi.mock(
  '@/services/database/database-service-factory',
  async () => await import('../mocks/database-service-factory.mock'),
)

export {}
