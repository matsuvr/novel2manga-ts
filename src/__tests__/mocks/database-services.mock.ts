// Re-export the database-service-factory mock so importing '@/services/database'
// during unit tests provides the expected exports (getDatabaseServiceFactory, db, etc.).
export * from './database-service-factory.mock'

// Also export the cleaned mock helpers for tests that import the mock database directly.
export * from './database-services-clean.mock'

// Provide a DatabaseService class similar to the real barrel's exported class
import { mockDatabase as _mockDatabase, MockDatabaseService } from './database-services-clean.mock'

export const DatabaseService = MockDatabaseService

export default {
  DatabaseService: MockDatabaseService,
  ..._mockDatabase,
}
