# Authentication Testing Guide

This guide explains how to properly test authentication functionality in the novel2manga application, including error handling, mock configuration, and best practices.

## Overview

The authentication system uses Effect-TS for type-safe error handling and NextAuth for session management. Testing authentication requires proper mock configuration and understanding of the authentication flow.

## Authentication Architecture

### Core Components

1. **AuthenticationError**: Custom error class for authentication failures
2. **requireAuth**: Effect that validates user session and returns authenticated user
3. **requireAuthWithBypass**: Development bypass functionality for testing
4. **getSearchParamsFromRequest**: Utility to extract URL parameters
5. **effectToApiResponse**: Converts Effect errors to API responses
6. **withAuth**: Higher-order function for authenticated API routes

### Error Handling

Authentication errors are handled using Effect-TS error types:

```typescript
class AuthenticationError {
  readonly _tag = 'AuthenticationError'
  constructor(readonly message: string) {}
}
```

## Testing Strategies

### Unit Testing Authentication Functions

For unit tests, use the provided mock utilities:

```typescript
import { AuthTestUtils, AuthTestScenarios } from '../../../test/utils/auth-test-utils'

describe('Authentication Tests', () => {
  beforeEach(() => {
    AuthTestUtils.resetMocks()
  })

  it('should handle valid authentication', async () => {
    const mockAuth = AuthTestUtils.createMockAuth()
    AuthTestUtils.configureMockAuth(mockAuth, AuthTestScenarios.validSession)

    // Test authentication logic
  })
})
```

### API Route Testing

For API routes that use authentication, the mocks are automatically configured:

```typescript
import { GET } from '../route'

describe('API Route Tests', () => {
  it('should require authentication', async () => {
    const request = new NextRequest('http://localhost:3000/api/test')
    const response = await GET(request)

    expect(response.status).toBe(200)
  })
})
```

### Integration Testing

For integration tests, use real database setup with mock authentication:

```typescript
import { TestDatabaseManager } from '../../utils/TestDatabaseManager'

describe('Integration Tests', () => {
  let testDb: TestDatabaseManager

  beforeAll(async () => {
    testDb = new TestDatabaseManager('auth-integration-test')
    await testDb.setup()
  })

  afterAll(async () => {
    await testDb.cleanup()
  })
})
```

## Mock Configuration

### Available Mock Scenarios

The `AuthTestScenarios` object provides common test scenarios:

- `validSession`: Valid user session with complete user data
- `invalidSession`: Session without user ID (should fail auth)
- `nullSession`: No session (user not logged in)
- `bypassUser`: Development bypass user for testing

### Environment Configuration

For testing bypass functionality:

```typescript
AuthTestUtils.setupBypassEnvironment(true, 'development')
```

### Custom Mock Configuration

Create custom mock sessions:

```typescript
const customSession = AuthTestUtils.createMockSession({
  id: 'custom-user-id',
  email: 'custom@example.com',
  name: 'Custom User',
})
```

## Error Testing

### Testing Authentication Errors

Use the provided error testing utilities:

```typescript
await AuthTestUtils.expectAuthError(requireAuth, 'Not authenticated')
```

### Testing API Error Responses

For API routes, test error responses:

```typescript
const response = await GET(request)
expect(response.status).toBe(401)

const body = await response.json()
expect(body.error.code).toBe('UNAUTHORIZED')
```

## Best Practices

### 1. Use Consistent Mock Configuration

Always use the provided mock utilities instead of creating custom mocks:

```typescript
// ✅ Good
const mockAuth = AuthTestUtils.createMockAuth()

// ❌ Avoid
const mockAuth = vi.fn().mockResolvedValue(...)
```

### 2. Reset Mocks Between Tests

Always reset mocks in beforeEach:

```typescript
beforeEach(() => {
  AuthTestUtils.resetMocks()
})
```

### 3. Test Error Scenarios

Always test both success and failure scenarios:

```typescript
describe('Authentication', () => {
  it('should succeed with valid session', async () => {
    // Test success case
  })

  it('should fail with invalid session', async () => {
    // Test failure case
  })
})
```

### 4. Use Type-Safe Error Testing

Use the provided error testing utilities for type safety:

```typescript
// ✅ Good
await AuthTestUtils.expectAuthError(effect, 'Expected message')

// ❌ Avoid
await expect(Effect.runPromise(effect)).rejects.toThrow()
```

## Common Issues and Solutions

### Issue: Mock Not Applied

**Problem**: Test imports real module instead of mock

**Solution**: Ensure mock is configured before import:

```typescript
vi.mock('@/auth', () => ({ auth: mockAuth }))
const { requireAuth } = await import('../requireAuth')
```

### Issue: Environment Variables Not Set

**Problem**: Bypass tests fail due to missing environment variables

**Solution**: Use the environment setup utility:

```typescript
AuthTestUtils.setupBypassEnvironment(true, 'development')
```

### Issue: Mock Functions Not Reset

**Problem**: Tests interfere with each other

**Solution**: Always reset mocks between tests:

```typescript
beforeEach(() => {
  AuthTestUtils.resetMocks()
})
```

## Testing Checklist

When testing authentication functionality:

- [ ] Test valid authentication scenarios
- [ ] Test invalid authentication scenarios (no session, no user ID)
- [ ] Test authentication service errors
- [ ] Test bypass functionality (if applicable)
- [ ] Test environment-specific behavior
- [ ] Test error message accuracy
- [ ] Test API response formats
- [ ] Reset mocks between tests
- [ ] Use type-safe error testing utilities

## Example Test Suite

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Effect } from 'effect'
import { AuthTestUtils, AuthTestScenarios } from '../../../test/utils/auth-test-utils'

const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: mockAuth }))

describe('Authentication Module', () => {
  beforeEach(() => {
    AuthTestUtils.resetMocks()
  })

  describe('requireAuth', () => {
    it('should return user for valid session', async () => {
      AuthTestUtils.configureMockAuth(mockAuth, AuthTestScenarios.validSession)

      const { requireAuth } = await import('../requireAuth')
      const result = await Effect.runPromise(requireAuth)

      expect(result.id).toBe('user-123')
    })

    it('should fail for null session', async () => {
      AuthTestUtils.configureMockAuth(mockAuth, AuthTestScenarios.nullSession)

      const { requireAuth } = await import('../requireAuth')

      await AuthTestUtils.expectAuthError(requireAuth, 'Not authenticated')
    })
  })

  describe('bypass functionality', () => {
    it('should work in development', async () => {
      AuthTestUtils.setupBypassEnvironment(true, 'development')

      const { requireAuthWithBypass } = await import('../requireAuth')
      const params = AuthTestUtils.createBypassParams(true)
      const result = await Effect.runPromise(requireAuthWithBypass(params))

      expect(result).toEqual(AuthTestScenarios.bypassUser)
    })
  })
})
```

This guide provides a comprehensive approach to testing authentication functionality while maintaining consistency and type safety across the application.
