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

    console.log('🧪 Integration test environment initialized')
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

  // Start transaction for test isolation
  // Note: This is handled by individual tests using createTransactionTest
  // No explicit setup needed here as TestDatabaseManager handles isolation
}, TEST_TIMEOUTS.UNIT)

/**
 * Cleanup after each test
 */
afterEach(async () => {
  // Transaction rollback is handled automatically by TestDatabaseManager
  // No explicit cleanup needed here
}, TEST_TIMEOUTS.UNIT)

/**
 * Cleanup integration test environment
 */
afterAll(async () => {
  try {
    // Cleanup all test databases
    await testDatabaseManager.cleanupAllDatabases()
    console.log('🧪 Integration test environment cleaned up')
  } catch (error) {
    console.error('Error during integration test cleanup:', error)
    // Don't throw here to avoid masking test failures
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
 * with database, fixtures, and cleanup
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

  // Call original handlers if they exist
  originalUnhandledRejection.forEach((handler) => {
    if (typeof handler === 'function') {
      try {
        ;(handler as (r: unknown, p: unknown) => void)(reason, promise)
      } catch {
        /* ignore */
      }
    }
  })
})

// Handle uncaught exceptions in integration tests
process.removeAllListeners('uncaughtException')
process.on('uncaughtException', (error) => {
  console.error('Integration test uncaught exception:', error)

  // Call original handlers if they exist
  originalUncaughtException.forEach((handler) => {
    if (typeof handler === 'function') {
      try {
        ;(handler as (err: unknown) => void)(error)
      } catch {
        /* ignore */
      }
    }
  })

  // Exit with error code
  process.exit(1)
})
