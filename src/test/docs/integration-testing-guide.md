# Integration Testing Guide

This guide explains how to use the updated integration test infrastructure for end-to-end workflow testing with proper database isolation and transaction management.

## Overview

The integration test infrastructure provides:

- **Isolated Test Databases**: Each test suite gets its own SQLite database
- **Transaction-Based Isolation**: Tests run in transactions that automatically rollback
- **Automatic Migration**: Test databases are automatically migrated to the latest schema
- **Comprehensive Fixtures**: Pre-built test data for common scenarios
- **Workflow Helpers**: Utilities for testing complete job processing workflows
- **Cleanup Automation**: Automatic cleanup of test databases and resources

## Quick Start

### Basic Integration Test

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createWorkflowTestContext,
  runWorkflowTest,
} from '../../test/helpers/integration-test-helpers'
import type { WorkflowTestContext } from '../../test/helpers/integration-test-helpers'
import { users, novels, jobs } from '@/db'
import { eq } from 'drizzle-orm'

describe('My Integration Test', () => {
  let context: WorkflowTestContext

  beforeAll(async () => {
    context = await createWorkflowTestContext({
      testSuiteName: 'my-integration-test',
      useMemory: true,
      scenario: 'complete',
    })
  })

  afterAll(async () => {
    await context.cleanup()
  })

  it('should test my workflow', async () => {
    await runWorkflowTest(context, async (db, fixtures) => {
      // Your test code here
      const user = fixtures.users![0]
      const novel = fixtures.novels![0]

      // Test database operations
      const userResult = await db.select().from(users).where(eq(users.id, user.id))

      expect(userResult).toHaveLength(1)
    })
  })
})
```

### Advanced Workflow Testing

```typescript
import {
  createJobProcessingWorkflow,
  simulateJobProgression,
  verifyJobCompletion,
} from '../../test/helpers/integration-test-helpers'

it('should process a complete job workflow', async () => {
  await runWorkflowTest(context, async (db) => {
    // Create a complete workflow
    const workflow = await createJobProcessingWorkflow(context.testDb)

    // Simulate job progression
    await simulateJobProgression(context.testDb, workflow.job.id, [
      { status: 'processing', currentStep: 'split' },
      { status: 'processing', currentStep: 'analyze' },
      { status: 'completed', currentStep: 'finished', processedEpisodes: 3 },
    ])

    // Verify completion
    const completion = await verifyJobCompletion(context.testDb, workflow.job.id)
    expect(completion.isCompleted).toBe(true)
  })
})
```

## Configuration

### Test Database Configuration

The `createWorkflowTestContext` function accepts these options:

```typescript
interface WorkflowTestOptions {
  testSuiteName: string // Unique name for your test suite
  useMemory?: boolean // Use in-memory database (default: true)
  scenario?: 'minimal' | 'complete' | 'workflow' | 'error' // Test data scenario
}
```

### Test Scenarios

- **minimal**: Just a user
- **complete**: User, novel, job, episode, and chunk
- **workflow**: Complete workflow with multiple episodes and chunks
- **error**: Error scenario fixtures for testing error handling

## Database Operations

### Transaction Isolation

All tests run within transactions that automatically rollback:

```typescript
await runWorkflowTest(context, async (db) => {
  // Any database changes here are automatically rolled back
  await db.insert(users).values(testUser)

  // This data won't persist to other tests
})
```

### Direct Database Access

For advanced scenarios, you can access the database directly:

```typescript
import { testDatabaseManager } from '../utils'

// Create isolated database
const testDb = await testDatabaseManager.createTestDatabase({
  testSuiteName: 'advanced-test',
  useMemory: true,
})

// Use transaction test
await testDatabaseManager.createTransactionTest(testDb, async (db) => {
  // Your test code
})

// Cleanup
await testDatabaseManager.cleanupDatabase('advanced-test')
```

## Helper Functions

### Job Processing Helpers

```typescript
// Create complete workflow
const workflow = await createJobProcessingWorkflow(testDb)

// Simulate job progression
await simulateJobProgression(testDb, jobId, [
  { status: 'processing', currentStep: 'analyze' },
  { status: 'completed', currentStep: 'finished' },
])

// Verify job completion
const completion = await verifyJobCompletion(testDb, jobId)

// Create error scenarios
await createErrorScenario(testDb, jobId, 'processing')
```

### Database Constraint Testing

```typescript
// Verify database constraints
const constraints = await verifyDatabaseConstraints(testDb)
expect(constraints.foreignKeyConstraints).toBe(true)
expect(constraints.uniqueConstraints).toBe(true)
expect(constraints.dataIntegrity).toBe(true)
```

### Concurrent Operations Testing

```typescript
// Test concurrent operations
const result = await createConcurrentTestScenario(testDb, jobId, 5)
expect(result.successful).toBeGreaterThan(0)
```

## Test Data Management

### Using Fixtures

```typescript
// Access pre-created fixtures
const user = context.fixtures.users![0]
const novel = context.fixtures.novels![0]
const job = context.fixtures.jobs![0]

// Create custom test data
const customUser = testFixturesManager.createUser({
  name: 'Custom User',
  email: 'custom@test.com',
})
```

### Setup Test Data

```typescript
// Setup specific test scenarios
const data = await setupIntegrationTestData(testDb, 'complex')

// Setup custom fixtures
const fixtures = testFixturesManager.createTestFixtures('workflow')
await testDatabaseManager.setupTestData(testDb, fixtures)
```

## Best Practices

### 1. Use Descriptive Test Suite Names

```typescript
// Good
testSuiteName: 'user-authentication-workflow'

// Bad
testSuiteName: 'test1'
```

### 2. Always Use Transaction Tests

```typescript
// Good - Isolated
await runWorkflowTest(context, async (db) => {
  // Test code
})

// Bad - Not isolated
const db = context.testDb.db
// Direct database operations without transaction
```

### 3. Clean Up Resources

```typescript
describe('My Test', () => {
    let context: WorkflowTestContext

    beforeAll(async () => {
        context = await createWorkflowTestContext({...})
    })

    afterAll(async () => {
        await context.cleanup() // Always cleanup
    })
})
```

### 4. Test Error Scenarios

```typescript
it('should handle database errors', async () => {
  await runWorkflowTest(context, async (db) => {
    // Test foreign key constraint
    await expect(db.insert(jobs).values(invalidJob)).rejects.toThrow()
  })
})
```

### 5. Use Appropriate Assertions

```typescript
// Good - Specific assertions
expect(completion.isCompleted).toBe(true)
expect(completion.hasAllEpisodes).toBe(true)

// Bad - Generic assertions
expect(completion).toBeTruthy()
```

## Configuration Files

### Integration Test Config

The integration tests use `vitest.integration.config.ts`:

```typescript
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    setupFiles: ['./src/test/setup/integration.setup.ts'],
    testTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Sequential execution for database isolation
      },
    },
  },
})
```

### Setup File

The setup file `src/test/setup/integration.setup.ts` handles:

- Environment variable configuration
- Global test database initialization
- Cleanup handlers
- Error handling

## Troubleshooting

### Common Issues

1. **Database Schema Errors**
   - Ensure migrations are up to date
   - Check that all required tables exist
   - Verify foreign key relationships

2. **Transaction Isolation Issues**
   - Always use `runWorkflowTest` for isolated tests
   - Don't access database directly outside transactions
   - Ensure proper cleanup in afterAll hooks

3. **Test Data Conflicts**
   - Use unique test suite names
   - Don't rely on specific fixture IDs
   - Create custom test data when needed

4. **Performance Issues**
   - Use in-memory databases for speed
   - Limit test data size
   - Use sequential execution for database tests

### Debugging

Enable detailed logging:

```typescript
// Set environment variables
process.env.LOG_LEVEL = 'debug'
process.env.TEST_DEBUG = '1'

// Check database state
console.log('Database state:', await db.select().from(jobs))
```

## Migration from Old Tests

### Before (Old Pattern)

```typescript
// Old integration test pattern
describe('Old Test', () => {
  beforeAll(async () => {
    // Manual database setup
  })

  it('test', async () => {
    // Direct database access
    // No transaction isolation
  })
})
```

### After (New Pattern)

```typescript
// New integration test pattern
describe('New Test', () => {
  let context: WorkflowTestContext

  beforeAll(async () => {
    context = await createWorkflowTestContext({
      testSuiteName: 'new-test',
      scenario: 'complete',
    })
  })

  afterAll(async () => {
    await context.cleanup()
  })

  it('test', async () => {
    await runWorkflowTest(context, async (db, fixtures) => {
      // Isolated, transactional test
    })
  })
})
```

## Examples

See the following files for complete examples:

- `src/__tests__/integration/workflow-complete.integration.test.ts` - Complete workflow testing
- `src/test/examples/database-integration.example.test.ts` - Database integration patterns
- `src/__tests__/services/service-integration.test.ts` - Service layer integration

## API Reference

### Core Functions

- `createWorkflowTestContext(options)` - Create isolated test environment
- `runWorkflowTest(context, testFn)` - Run test in transaction
- `createJobProcessingWorkflow(testDb)` - Create complete workflow
- `simulateJobProgression(testDb, jobId, steps)` - Simulate job progression
- `verifyJobCompletion(testDb, jobId)` - Verify job completion
- `verifyDatabaseConstraints(testDb)` - Verify database integrity

### Utility Functions

- `createErrorScenario(testDb, jobId, errorType)` - Create error scenarios
- `createConcurrentTestScenario(testDb, jobId, count)` - Test concurrent operations
- `setupIntegrationTestData(testDb, scenario)` - Setup test data

### Test Fixtures

- `testFixturesManager.createUser(overrides)` - Create test user
- `testFixturesManager.createNovel(userId, overrides)` - Create test novel
- `testFixturesManager.createJob(novelId, userId, overrides)` - Create test job
- `testFixturesManager.setupCompleteWorkflow(options)` - Create complete workflow

This infrastructure provides a robust foundation for integration testing with proper isolation, cleanup, and comprehensive test utilities.
