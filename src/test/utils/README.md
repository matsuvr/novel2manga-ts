# Test Utilities Documentation

This directory contains comprehensive test utilities for the novel2manga application, providing isolated database testing, fixtures management, and test automation.

## Overview

The test utilities are designed to support both unit and integration testing with proper isolation, cleanup, and consistent data setup. The main components are:

- **TestDatabaseManager**: Manages isolated test databases with automatic migration and cleanup
- **TestFixturesManager**: Creates consistent test data for all entity types
- **Integration Setup**: Provides seamless integration test configuration

## TestDatabaseManager

The `TestDatabaseManager` class provides isolated test database creation, migration management, and cleanup automation.

### Key Features

- **Isolated Databases**: Each test suite gets its own database instance
- **Automatic Migrations**: Applies latest schema migrations automatically
- **Transaction Isolation**: Supports transaction-based test isolation
- **Cleanup Automation**: Automatic cleanup on test completion and process exit
- **Memory & File Support**: Supports both in-memory and file-based databases

### Basic Usage

```typescript
import { testDatabaseManager } from '@/test/utils'

// Create isolated test database
const testDb = await testDatabaseManager.createTestDatabase({
  testSuiteName: 'my-test-suite',
  useMemory: true, // Use in-memory for speed
  cleanupOnExit: true,
})

// Use the database
const users = await testDb.db.select().from(userTable)

// Cleanup (automatic on test completion)
await testDatabaseManager.cleanupDatabase('my-test-suite')
```

### Transaction Isolation

```typescript
// Run test in isolated transaction that automatically rolls back
await testDatabaseManager.createTransactionTest(testDb, async (db) => {
  // Insert test data
  await db.insert(userTable).values(testUser)

  // Test operations
  const users = await db.select().from(userTable)
  expect(users).toHaveLength(1)

  // Transaction automatically rolls back after test
})

// Data is automatically cleaned up
```

## TestFixturesManager

The `TestFixturesManager` class provides consistent test data creation for all entity types with proper relationships.

### Key Features

- **Entity Creation**: Create individual entities with sensible defaults
- **Relationship Management**: Automatically handles foreign key relationships
- **Workflow Scenarios**: Create complete workflow scenarios with all related entities
- **Scenario Templates**: Pre-built scenarios for common testing needs
- **Override Support**: Easy customization of entity properties

### Basic Usage

```typescript
import { testFixturesManager } from '@/test/utils'

// Create individual entities
const user = testFixturesManager.createUser({
  name: 'Test User',
  email: 'test@example.com',
})

const novel = testFixturesManager.createNovel(user.id, {
  title: 'Test Novel',
})

const job = testFixturesManager.createJob(novel.id, user.id)
```

### Workflow Scenarios

```typescript
// Create complete workflow with all related entities
const workflow = testFixturesManager.setupCompleteWorkflow({
  user: { name: 'Workflow User' },
  novel: { title: 'Test Novel' },
  episodeCount: 3,
  chunkCount: 5,
})

// Access all created entities
console.log(workflow.user.id)
console.log(workflow.novel.title)
console.log(workflow.episodes.length) // 3
console.log(workflow.chunks.length) // 5
```

### Scenario Templates

```typescript
// Pre-built scenarios for common testing needs
const minimalFixtures = testFixturesManager.createTestFixtures('minimal')
const completeFixtures = testFixturesManager.createTestFixtures('complete')
const workflowFixtures = testFixturesManager.createTestFixtures('workflow')

// Error scenarios
const errorFixtures = testFixturesManager.createErrorScenarioFixtures()
const processingFixtures = testFixturesManager.createProcessingStateFixtures()
```

## Integration Test Setup

The integration test setup provides seamless configuration for integration testing with proper database lifecycle management.

### Usage in Integration Tests

```typescript
import {
  getIntegrationTestDb,
  runInTransaction,
  setupIntegrationTestData,
} from '@/test/setup/integration.setup'

describe('Integration Test', () => {
  it('should test complete workflow', async () => {
    // Setup test data
    const fixtures = await setupIntegrationTestData('workflow')

    // Run test in isolated transaction
    await runInTransaction(async (db) => {
      // Test operations with automatic rollback
      const jobs = await db.select().from(jobsTable)
      expect(jobs).toHaveLength(1)
    })
  })
})
```

## Configuration

### Test Database Configuration

```typescript
interface TestDatabaseConfig {
  testSuiteName: string // Unique identifier for the test suite
  useMemory?: boolean // Use in-memory database (default: true)
  migrationPath?: string // Path to migration files (default: 'drizzle')
  cleanupOnExit?: boolean // Auto-cleanup on process exit (default: true)
}
```

### Vitest Configuration

The utilities integrate with Vitest configuration:

```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    setupFiles: ['./src/test/setup/integration.setup.ts'],
    // ... other config
  },
})
```

## Best Practices

### 1. Test Isolation

- Always use isolated test databases for integration tests
- Use transaction isolation for unit tests when possible
- Clean up test data after each test

### 2. Fixture Management

- Use TestFixturesManager for consistent test data
- Prefer scenario templates over manual entity creation
- Override only necessary properties to keep tests focused

### 3. Performance

- Use in-memory databases for speed
- Minimize database operations in tight loops
- Reuse fixtures when possible

### 4. Error Handling

- Test both success and error scenarios
- Use error scenario fixtures for consistent error testing
- Verify proper cleanup on test failures

## Examples

### Complete Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { testDatabaseManager, testFixturesManager } from '@/test/utils'
import { user, novels, jobs } from '@/db/schema'

describe('User Management Integration', () => {
  let testDb: TestDatabase

  beforeAll(async () => {
    testDb = await testDatabaseManager.createTestDatabase({
      testSuiteName: 'user-management-integration',
      useMemory: true,
    })
  })

  afterAll(async () => {
    await testDatabaseManager.cleanupDatabase(testDb.config.testSuiteName)
  })

  it('should create user with novels and jobs', async () => {
    await testDatabaseManager.createTransactionTest(testDb, async (db) => {
      // Setup test data
      const workflow = testFixturesManager.setupCompleteWorkflow()

      // Insert data
      await db.insert(user).values(workflow.user)
      await db.insert(novels).values(workflow.novel)
      await db.insert(jobs).values(workflow.job)

      // Test relationships
      const userWithNovels = await db
        .select()
        .from(user)
        .leftJoin(novels, eq(user.id, novels.userId))
        .where(eq(user.id, workflow.user.id))

      expect(userWithNovels).toHaveLength(1)
      expect(userWithNovels[0].novels?.title).toBe(workflow.novel.title)
    })
  })
})
```

### Unit Test with Fixtures

```typescript
import { describe, it, expect } from 'vitest'
import { testFixturesManager } from '@/test/utils'
import { UserService } from '@/services/UserService'

describe('UserService', () => {
  it('should validate user data', () => {
    const user = testFixturesManager.createUser({
      email: 'invalid-email', // Test validation
    })

    const userService = new UserService()
    expect(() => userService.validateUser(user)).toThrow('Invalid email')
  })
})
```

## Troubleshooting

### Common Issues

1. **Schema Access Errors**: Ensure you're importing schema tables directly from `@/db/schema`
2. **Migration Failures**: Check that migration files exist and are valid
3. **Transaction Isolation**: Use `createTransactionTest` for proper isolation
4. **Cleanup Issues**: Verify cleanup handlers are registered properly

### Debug Tips

- Enable verbose logging with `LOG_LEVEL=debug`
- Check database table creation with raw SQL queries
- Verify migration application with schema inspection
- Use simple tests first to verify basic functionality

## API Reference

### TestDatabaseManager

- `createTestDatabase(config)`: Create isolated test database
- `setupTestData(testDb, fixtures)`: Setup test data using fixtures
- `createTransactionTest(testDb, testFn)`: Run test in isolated transaction
- `cleanupDatabase(testSuiteName)`: Cleanup specific database
- `cleanupAllDatabases()`: Cleanup all active databases

### TestFixturesManager

- `createUser(overrides?)`: Create test user
- `createNovel(userId, overrides?)`: Create test novel
- `createJob(novelId, userId, overrides?)`: Create test job
- `setupCompleteWorkflow(options?)`: Create complete workflow scenario
- `createTestFixtures(scenario)`: Create scenario-based fixtures
- `createErrorScenarioFixtures()`: Create error scenario fixtures

This documentation provides comprehensive guidance for using the test utilities effectively in both unit and integration testing scenarios.
