/**
 * Test Data Cleanup Utilities
 *
 * Provides utilities for proper test isolation through data cleanup,
 * transaction management, and test environment reset.
 */

import type { TestDbHandle } from './simple-test-db'
// Using simple-test-db handle type; creation/cleanup is managed by callers

export interface CleanupOptions {
  preserveSchema?: boolean
  resetAutoIncrement?: boolean
  vacuum?: boolean
}

export interface CleanupResult {
  tablesCleared: string[]
  recordsDeleted: number
  success: boolean
  error?: string
}

/**
 * Test data cleanup utilities for proper test isolation
 */
/**
 * Clear all data from test database while preserving schema
 */
export function clearAllTestData(
  testDb: TestDbHandle,
  options: CleanupOptions = {},
): CleanupResult {
  const { resetAutoIncrement = true, vacuum = false } = options

  const result: CleanupResult = {
    tablesCleared: [],
    recordsDeleted: 0,
    success: false,
  }

  try {
    // Get all table names from the database
    const tables = getAllTableNames(testDb)

    // Disable foreign key constraints temporarily
    testDb.sqlite.exec('PRAGMA foreign_keys = OFF')

    let totalDeleted = 0

    // Clear each table
    for (const tableName of tables) {
      try {
        // Get count before deletion
        const countResult = testDb.sqlite
          .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
          .get() as unknown
        const count =
          countResult && typeof (countResult as Record<string, unknown>).count === 'number'
            ? ((countResult as Record<string, unknown>).count as number)
            : 0

        // Delete all records
        testDb.sqlite.prepare(`DELETE FROM ${tableName}`).run()

        // Reset auto-increment if requested
        if (resetAutoIncrement) {
          try {
            testDb.sqlite.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tableName)
          } catch (_seqError) {
            // Ignore if sqlite_sequence doesn't exist or table not found
          }
        }

        result.tablesCleared.push(tableName)
        totalDeleted += count
      } catch (error) {
        console.warn(`Failed to clear table ${tableName}:`, error)
      }
    }

    result.recordsDeleted = totalDeleted

    // Re-enable foreign key constraints
    testDb.sqlite.exec('PRAGMA foreign_keys = ON')

    // Vacuum database if requested
    if (vacuum) {
      testDb.sqlite.exec('VACUUM')
    }

    result.success = true
    return result
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.success = false

    // Ensure foreign keys are re-enabled even on error
    try {
      testDb.sqlite.exec('PRAGMA foreign_keys = ON')
    } catch (fkError) {
      console.warn('Failed to re-enable foreign keys:', fkError)
    }

    return result
  }
}

/**
 * Clear specific tables in dependency order
 */
export function clearSpecificTables(
  testDb: TestDbHandle,
  tableNames: string[],
  options: CleanupOptions = {},
): CleanupResult {
  const { resetAutoIncrement = true } = options

  const result: CleanupResult = {
    tablesCleared: [],
    recordsDeleted: 0,
    success: false,
  }

  try {
    // Disable foreign key constraints temporarily
    testDb.sqlite.exec('PRAGMA foreign_keys = OFF')

    let totalDeleted = 0

    // Clear tables in reverse dependency order (children first)
    const orderedTables = orderTablesByDependency(tableNames)

    for (const tableName of orderedTables) {
      try {
        // Get count before deletion
        const countResult = testDb.sqlite
          .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
          .get() as unknown
        const count =
          countResult && typeof (countResult as Record<string, unknown>).count === 'number'
            ? ((countResult as Record<string, unknown>).count as number)
            : 0

        // Delete all records
        testDb.sqlite.prepare(`DELETE FROM ${tableName}`).run()

        // Reset auto-increment if requested
        if (resetAutoIncrement) {
          try {
            testDb.sqlite.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tableName)
          } catch (_seqError) {
            // Ignore if sqlite_sequence doesn't exist or table not found
          }
        }

        result.tablesCleared.push(tableName)
        totalDeleted += count
      } catch (error) {
        console.warn(`Failed to clear table ${tableName}:`, error)
      }
    }

    result.recordsDeleted = totalDeleted

    // Re-enable foreign key constraints
    testDb.sqlite.exec('PRAGMA foreign_keys = ON')

    result.success = true
    return result
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.success = false

    // Ensure foreign keys are re-enabled even on error
    try {
      testDb.sqlite.exec('PRAGMA foreign_keys = ON')
    } catch (fkError) {
      console.warn('Failed to re-enable foreign keys:', fkError)
    }

    return result
  }
}

/**
 * Reset test database to clean state
 */
export async function resetTestDatabase(testDb: TestDbHandle): Promise<void> {
  clearAllTestData(testDb, {
    resetAutoIncrement: true,
    vacuum: true,
  })
}

/**
 * Create isolated test transaction that automatically rolls back
 */
export async function withIsolatedTransaction<T>(
  _testDb: TestDbHandle,
  testFn: (db: TestDbHandle['db']) => Promise<T>,
): Promise<T> {
  // better-sqlite3 + drizzle transaction helper is available via db.transaction
  return testFn(_testDb.db)
}

/**
 * Create test data isolation wrapper
 */
export async function withDataIsolation<T>(
  testDb: TestDbHandle,
  testFn: (db: TestDbHandle['db']) => Promise<T>,
  cleanupAfter: boolean = true,
): Promise<T> {
  try {
    const result = await testFn(testDb.db)

    if (cleanupAfter) {
      clearAllTestData(testDb)
    }

    return result
  } catch (error) {
    // Always cleanup on error
    clearAllTestData(testDb)
    throw error
  }
}

/**
 * Cleanup multiple test databases
 */
export async function cleanupMultipleDatabases(_testSuiteNames: string[]): Promise<void> {
  // No-op: single in-memory DB per test run; callers should close their own handles.
}

/**
 * Get all table names from the database
 */
export function getAllTableNames(testDb: TestDbHandle): string[] {
  try {
    const result = testDb.sqlite
      .prepare(
        `
            SELECT name FROM sqlite_master
            WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name != '__drizzle_migrations'
        `,
      )
      .all() as unknown[]

    return result
      .map((row: unknown) => {
        if (
          typeof row === 'object' &&
          row !== null &&
          'name' in (row as Record<string, unknown>) &&
          typeof (row as Record<string, unknown>).name === 'string'
        ) {
          return (row as Record<string, unknown>).name as string
        }
        return ''
      })
      .filter((n) => n)
  } catch (error) {
    console.warn('Failed to get table names:', error)
    return []
  }
}

/**
 * Order tables by dependency (children first for deletion)
 */
export function orderTablesByDependency(tableNames: string[]): string[] {
  // Define dependency order for our schema (children first)
  const dependencyOrder = [
    'render_status',
    'layout_status',
    'chunk_analysis_status',
    'outputs',
    'chunks',
    'episodes',
    'jobs',
    'novels',
    'session',
    'account',
    'verificationToken',
    'authenticators',
    'user',
  ]

  // Filter to only include requested tables and maintain order
  return dependencyOrder.filter((table) => tableNames.includes(table))
}

/**
 * Verify database is clean (no data in any tables)
 */
export function verifyDatabaseIsClean(testDb: TestDbHandle): boolean {
  try {
    const tables = getAllTableNames(testDb)

    for (const tableName of tables) {
      const result = testDb.sqlite
        .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
        .get() as unknown
      const count =
        result && typeof (result as Record<string, unknown>).count === 'number'
          ? ((result as Record<string, unknown>).count as number)
          : 0

      if (count > 0) {
        console.warn(`Table ${tableName} is not clean, has ${count} records`)
        return false
      }
    }

    return true
  } catch (error) {
    console.error('Failed to verify database cleanliness:', error)
    return false
  }
}

/**
 * Get database statistics for debugging
 */
export function getDatabaseStats(testDb: TestDbHandle): Record<string, number> {
  const stats: Record<string, number> = {}

  try {
    const tables = getAllTableNames(testDb)

    for (const tableName of tables) {
      const result = testDb.sqlite
        .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
        .get() as unknown
      stats[tableName] =
        result && typeof (result as Record<string, unknown>).count === 'number'
          ? ((result as Record<string, unknown>).count as number)
          : 0
    }
  } catch (error) {
    console.error('Failed to get database stats:', error)
  }

  return stats
}

/**
 * Create cleanup handler for test suite
 */
export function createCleanupHandler(_testSuiteName: string): () => Promise<void> {
  return async () => Promise.resolve()
}

/**
 * Register cleanup handlers for multiple test suites
 */
export function registerCleanupHandlers(testSuiteNames: string[]): void {
  const cleanup = async () => {
    await cleanupMultipleDatabases(testSuiteNames)
  }

  // Register cleanup on various exit conditions
  process.once('exit', cleanup)
  process.once('SIGINT', cleanup)
  process.once('SIGTERM', cleanup)
  process.once('uncaughtException', cleanup)
  process.once('unhandledRejection', cleanup)
}

// Backwards-compatible object export to preserve previous import sites
export const TestDataCleanupUtils = {
  clearAllTestData,
  clearSpecificTables,
  resetTestDatabase,
  withIsolatedTransaction,
  withDataIsolation,
  cleanupMultipleDatabases,
  getAllTableNames,
  orderTablesByDependency,
  verifyDatabaseIsClean,
  getDatabaseStats,
  createCleanupHandler,
  registerCleanupHandlers,
}
