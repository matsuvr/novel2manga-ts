/**
 * Integration Test Setup Configuration
 *
 * Configures isolated test databases and proper cleanup for integration testing.
 * Uses TestDatabaseManager for database lifecycle management and follows
 * established patterns for new integration tests.
 */

import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest'
import type { TestDatabase } from '../utils'
import { testDatabaseManager, testFixturesManager } from '../utils'
import { setupTestEnvironment, TEST_TIMEOUTS } from './common.setup'

// Ensure Next.js server types are available in integration environment
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { vi } = require('vitest')
} catch {
  // noop
}

import { createDatabaseConnection } from '@/infrastructure/database/connection'
// Initialize DatabaseServiceFactory for integration tests when we create the test DB
import { initializeDatabaseServiceFactory } from '@/services/database/database-service-factory'

// Global test database instance
let globalTestDb: TestDatabase | undefined

/**
 * Setup integration test environment
 */
beforeAll(async () => {
  // Setup common test environment
  setupTestEnvironment()

  // Set integration-specific environment variables
  process.env.DB_SKIP_MIGRATE = '0' // Allow migrations in integration tests
  process.env.ALLOW_ADMIN_BYPASS = 'true' // Allow admin bypass for testing

  try {
    // Create global test database for integration tests
    globalTestDb = await testDatabaseManager.createTestDatabase({
      testSuiteName: 'integration-global',
      useMemory: true, // Use in-memory for speed
      cleanupOnExit: true,
    })
    // Initialize the global DatabaseServiceFactory so modules using db.* work in integration tests
    try {
      // createDatabaseConnection expects a Drizzle sqlite instance; cast to any for safety
      const conn = createDatabaseConnection({ sqlite: globalTestDb.db as unknown as any })
      initializeDatabaseServiceFactory(conn)
      // Fail fast: assert the factory's raw database exposes transaction and schema
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const {
          getDatabaseServiceFactory,
        } = require('@/services/database/database-service-factory')
        const factory = getDatabaseServiceFactory()
        const raw = factory.getRawDatabase() as unknown as Record<string, unknown>
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof (raw as any).transaction !== 'function' ||
          !('schema' in raw)
        ) {
          console.error(
            'Integration setup: database shape invalid after initializeDatabaseServiceFactory',
            {
              keys: raw && typeof raw === 'object' ? Object.keys(raw) : null,
              hasTransaction: raw && typeof (raw as any).transaction === 'function',
              hasSchema: raw && 'schema' in raw,
            },
          )
          throw new Error('Integration setup: DatabaseServiceFactory produced invalid raw database')
        }
      } catch (assertErr) {
        console.warn('Integration DB assertion failed:', assertErr)
        throw assertErr
      }
    } catch (initErr) {
      console.warn(
        'Warning: Failed to initialize DatabaseServiceFactory in integration setup:',
        initErr,
      )
    }
    // Ensure a stable test user exists to satisfy FK constraints in integration tests
    try {
      const fixtures = testFixturesManager.createTestFixtures('minimal') as any
      // minimal scenario includes one user
      const user = fixtures?.users?.[0]
      if (user) {
        try {
          // Use direct sqlite handle to insert user without relying on higher-level services
          const sqlite = (globalTestDb as any).sqlite as any
          sqlite
            .prepare(
              `INSERT INTO user (id, name, email, emailVerified, image, createdAt, emailNotifications, theme, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              user.id,
              user.name,
              user.email,
              user.emailVerified,
              user.image,
              user.createdAt,
              1,
              user.theme,
              user.language,
            )
          console.log(`[TestDB] Seeded integration user: ${user.id}`)
        } catch (e) {
          // ignore duplicate key races
          // eslint-disable-next-line no-console
          console.log(
            '[TestDB] seed user skipped (may already exist):',
            e instanceof Error ? e.message : String(e),
          )
        }
      }
    } catch (seedErr) {
      console.warn('Warning: Failed to seed integration test user:', seedErr)
    }
  } catch (error) {
    console.error('Failed to initialize integration test environment:', error)
    throw error
  }
}, TEST_TIMEOUTS.INTEGRATION)

/**
 * Setup before each test
 */
beforeEach(async () => {
  if (!globalTestDb) {
    throw new Error('Global test database not initialized')
  }

  // No explicit setup needed here; TestDatabaseManager handles isolation
}, TEST_TIMEOUTS.UNIT)

/**
 * Cleanup after each test
 */
afterEach(async () => {
  // Transaction rollback is handled automatically by TestDatabaseManager
  // Ensure mocks are cleaned up between tests
  const { vi } = await import('vitest')
  vi.restoreAllMocks()
}, TEST_TIMEOUTS.UNIT)

/**
 * Cleanup integration test environment
 */
afterAll(async () => {
  try {
    // Cleanup all test databases
    await testDatabaseManager.cleanupAllDatabases()
    console.log('🪪 Integration test environment cleaned up')
  } catch (error) {
    console.error('Error during integration test cleanup:', error)
  }
}, TEST_TIMEOUTS.INTEGRATION)

/**
 * Get the global test database for integration tests
 */
export function getIntegrationTestDb(): TestDatabase {
  if (!globalTestDb) {
    throw new Error(
      'Integration test database not initialized. Make sure to run tests with proper setup.',
    )
  }
  return globalTestDb
}

/**
 * Create an isolated test database for a specific test suite
 */
export async function createIsolatedTestDb(testSuiteName: string): Promise<TestDatabase> {
  return testDatabaseManager.createTestDatabase({
    testSuiteName: `integration-${testSuiteName}`,
    useMemory: true,
    cleanupOnExit: true,
  })
}

/**
 * Run a test within a transaction that automatically rolls back
 */
export async function runInTransaction<T>(
  testFn: (db: TestDatabase['db']) => Promise<T>,
): Promise<T> {
  const testDb = getIntegrationTestDb()
  return testDatabaseManager.createTransactionTest(testDb, testFn)
}

/**
 * Setup test data for integration tests
 */
export async function setupIntegrationTestData(
  scenario: 'minimal' | 'complete' | 'workflow' = 'minimal',
) {
  const testDb = getIntegrationTestDb()
  const fixtures = testFixturesManager.createTestFixtures(scenario)

  await testDatabaseManager.setupTestData(testDb, fixtures)

  return fixtures
}

/**
 * Helper function to create a complete integration test environment
 */
export async function createIntegrationTestEnvironment<T>(
  testName: string,
  scenario: 'minimal' | 'complete' | 'workflow' = 'minimal',
  testFn: (db: TestDatabase['db'], fixtures: unknown) => Promise<T>,
): Promise<T> {
  const testDb = await createIsolatedTestDb(testName)

  try {
    const fixtures = testFixturesManager.createTestFixtures(scenario)
    await testDatabaseManager.setupTestData(testDb, fixtures)

    return await testDatabaseManager.createTransactionTest(testDb, async (db) => {
      return testFn(db, fixtures)
    })
  } finally {
    await testDatabaseManager.cleanupDatabase(testDb)
  }
}

/**
 * Utility to run integration tests with proper error handling
 */
export function withIntegrationTest<T>(
  _testName: string,
  testFn: (helpers: {
    db: TestDatabase['db']
    fixtures: unknown
    runInTransaction: typeof runInTransaction
  }) => Promise<T>,
) {
  return async () => {
    const testDb = getIntegrationTestDb()
    const fixtures = await setupIntegrationTestData('complete')

    return testDatabaseManager.createTransactionTest(testDb, async (db) => {
      return testFn({
        db,
        fixtures,
        runInTransaction: (fn) => testDatabaseManager.createTransactionTest(testDb, fn),
      })
    })
  }
}

// Enhanced error handling for integration tests
const originalUnhandledRejection = process.listeners('unhandledRejection')
const originalUncaughtException = process.listeners('uncaughtException')

// Handle unhandled rejections in integration tests
process.removeAllListeners('unhandledRejection')
process.on('unhandledRejection', (reason, promise) => {
  console.error('Integration test unhandled rejection:', reason)
  console.error('Promise:', promise)

  function safeCallUnhandledRejectionHandler(
    handler: unknown,
    reasonArg: unknown,
    promiseArg: unknown,
  ) {
    if (typeof handler === 'function') {
      try {
        ;(handler as (r: unknown, p: unknown) => void)(reasonArg, promiseArg)
      } catch {}
    }
  }

  originalUnhandledRejection.forEach((handler) => {
    safeCallUnhandledRejectionHandler(handler, reason, promise)
  })
})

// Handle uncaught exceptions in integration tests
process.removeAllListeners('uncaughtException')
process.on('uncaughtException', (error) => {
  console.error('Integration test uncaught exception:', error)

  function safeCallUncaughtExceptionHandler(handler: unknown, errorArg: unknown) {
    if (typeof handler === 'function') {
      try {
        const fn = handler as (err: unknown, origin?: unknown) => void
        fn(errorArg)
      } catch {}
    }
  }

  originalUncaughtException.forEach((handler) => {
    safeCallUncaughtExceptionHandler(handler, error)
  })

  // Exit with error code
  process.exit(1)
})
