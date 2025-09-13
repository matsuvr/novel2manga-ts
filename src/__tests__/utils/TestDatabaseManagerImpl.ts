// Lightweight shim for TestDatabaseManager used by integration tests.
// This provides minimal interfaces used by the integration.setup.ts file.
import { vi } from 'vitest'

export type TestDatabase = {
  id: string
  db: unknown
}

class TestDatabaseManagerImpl {
  private dbs: TestDatabase[] = []

  async createTestDatabase(opts: {
    testSuiteName?: string
    useMemory?: boolean
    cleanupOnExit?: boolean
  }): Promise<TestDatabase> {
    const db = { id: `testdb-${Date.now()}`, db: {} }
    this.dbs.push(db)
    return db
  }

  async createTransactionTest<T>(
    testDb: TestDatabase,
    fn: (db: unknown) => Promise<T>,
  ): Promise<T> {
    return fn(testDb.db)
  }

  async cleanupAllDatabases(): Promise<void> {
    this.dbs = []
  }

  async cleanupDatabase(_db: TestDatabase | string): Promise<void> {
    // noop in shim - accept either TestDatabase or a string identifier
  }

  async setupTestData(_db: TestDatabase, _fixtures: unknown): Promise<void> {
    // noop shim
  }
}

export const testDatabaseManager = new TestDatabaseManagerImpl()
export default testDatabaseManager
