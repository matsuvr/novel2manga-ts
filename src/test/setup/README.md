# Test Configuration Setup

This directory contains the test setup configuration files that establish consistent patterns for all test types in the application.

## Setup Files Overview

### `common.setup.ts`

Shared utilities and patterns used across all test types:

- Test environment configuration
- Mock cleanup utilities
- Common mock patterns (users, jobs, novels)
- Mock request/response utilities for API tests
- Error testing utilities
- Test data factories

### `unit.setup.ts`

Configuration for unit tests:

- Database mocks using `database.mock.ts`
- Authentication mocks using `auth.mock.ts`
- API error handling mocks using `api.mock.ts`
- External service mocks (email, LLM, etc.)
- File system and path operation mocks
- Configuration module mocks

### `api.setup.ts`

Additional configuration specifically for API route tests:

- API-specific authentication mocks
- NextAuth provider mocks
- Next.js server component mocks
- Database service mocks for API endpoints

### `integration.setup.ts`

Configuration for integration tests:

- Real database setup using TestDatabaseManager
- Test database lifecycle management
- Transaction-based test isolation
- Integration test helpers and utilities
- Error handling for integration tests

## Test Configuration Patterns

### Unit Tests

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts', './src/test/setup/unit.setup.ts'],
    mockReset: true,
    clearMocks: true,
    restoreMocks: true,
    // Mock aliases for unit tests
    resolve: {
      alias: {
        '@/db': './src/test/mocks/database.mock.ts',
        '@/services/database': './src/test/mocks/database-services.mock.ts',
        '@/server/auth': './src/test/mocks/auth.mock.ts',
      },
    },
  },
})
```

### Integration Tests

```typescript
// vitest.integration.config.ts
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'node',
    setupFiles: ['./src/test/setup/integration.setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true }, // Sequential execution for DB isolation
    },
    // No mock aliases - use real implementations
  },
})
```

## Usage Examples

### Unit Test Example

```typescript
import { describe, it, expect } from 'vitest'
import { TestDataFactory } from '../test/setup/common.setup'

describe('UserService', () => {
  it('should create a user', async () => {
    const userData = TestDataFactory.user({ email: 'test@example.com' })
    // Test implementation using mocked database
  })
})
```

### Integration Test Example

```typescript
import { describe, it, expect } from 'vitest'
import { withIntegrationTest } from '../test/setup/integration.setup'

describe('User Workflow Integration', () => {
  it(
    'should complete user registration workflow',
    withIntegrationTest('user-registration', async ({ db, fixtures }) => {
      // Test implementation using real database
    }),
  )
})
```

### API Test Example

```typescript
import { describe, it, expect } from 'vitest'
import { createMockRequest, expectSuccessResponse } from '../test/setup/common.setup'

describe('API Route: /api/users', () => {
  it('should create a user', async () => {
    const request = createMockRequest({
      method: 'POST',
      body: { email: 'test@example.com' },
    })

    const response = await POST(request)
    await expectSuccessResponse(response, 201)
  })
})
```

## Mock Configuration

### Database Mocks

- All database tables are mocked with CRUD operations
- Consistent mock responses across all tests
- Type-safe mock implementations
- Support for both Drizzle ORM and service layer patterns

### Authentication Mocks

- NextAuth session mocking
- API authentication middleware mocking
- Effect-TS authentication error handling
- Admin bypass functionality for testing

### API Mocks

- Comprehensive API error class mocking
- Effect-TS to API response conversion
- Consistent error response formats
- Request/response utilities

## Best Practices

### For Unit Tests

1. Use mocks for all external dependencies
2. Test business logic in isolation
3. Use `TestDataFactory` for consistent test data
4. Reset mocks between tests automatically

### For Integration Tests

1. Use real database with transaction isolation
2. Test complete workflows end-to-end
3. Use `withIntegrationTest` helper for setup/cleanup
4. Test database interactions and side effects

### For API Tests

1. Use both unit and API setup files
2. Test request/response handling
3. Test authentication and authorization
4. Test error handling and edge cases

## Environment Variables

The setup files configure these environment variables for testing:

- `NODE_ENV=test` - Indicates test environment
- `LOG_LEVEL=warn` - Reduces log noise during tests
- `DB_SKIP_MIGRATE=0` - Allows migrations in integration tests
- `ALLOW_ADMIN_BYPASS=true` - Enables admin bypass for testing

## Troubleshooting

### Common Issues

1. **Mock not working**: Ensure the mock is configured in the correct setup file
2. **Database errors**: Check that integration setup is properly initialized
3. **Type errors**: Verify mock implementations match real interfaces
4. **Test isolation**: Use transaction-based testing for integration tests

### Debug Tips

1. Set `VITEST_VERBOSE=true` to see console output during tests
2. Use `vi.mocked()` to access mock functions in tests
3. Check setup file order in vitest configuration
4. Verify alias configuration matches mock file paths

## File Structure

```
src/test/setup/
├── README.md              # This documentation
├── common.setup.ts        # Shared utilities and patterns
├── unit.setup.ts          # Unit test configuration
├── api.setup.ts           # API test configuration
└── integration.setup.ts   # Integration test configuration
```

This setup ensures consistent, reliable testing across the entire application while following established patterns for maintainability and scalability.
