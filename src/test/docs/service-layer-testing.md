# Service Layer Testing Guide

This guide demonstrates proper testing patterns for service layer components using Effect-TS with comprehensive mocking strategies.

## Overview

The service layer testing approach focuses on:

- **Effect-TS Error Handling**: Proper testing of Effect-TS error types and composition
- **Database Dependency Mocking**: Using importOriginal pattern for database mocks
- **Service Composition**: Testing complex workflows with multiple service interactions
- **Type Safety**: Maintaining TypeScript type safety throughout test scenarios

## Key Testing Patterns

### 1. Service Mock Creation

```typescript
// Create mock service with proper Effect-TS error handling
const mockUserService = {
  getSettings: vi.fn().mockImplementation((userId: string) => {
    if (userId === 'nonexistent-user') {
      return Effect.fail(new UserNotFoundError(userId))
    }
    if (userId === 'db-error-user') {
      return Effect.fail(new DatabaseError('Database connection failed'))
    }
    return Effect.succeed({
      emailNotifications: true,
      theme: 'light',
      language: 'ja',
    })
  }),
  // ... other methods
}
```

### 2. Database Mocking with importOriginal Pattern

```typescript
// Mock database module while preserving original exports
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()

  return {
    ...actual,
    getDatabase: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'test-user' }]),
        }),
      }),
      // ... other database operations
    }),
  }
})
```

### 3. Effect-TS Error Testing

```typescript
// Test Effect-TS error handling with proper error extraction
class EffectTestUtils {
  static async expectFailureWithTag<A, E extends { _tag: string }>(
    effect: Effect.Effect<A, E, never>,
    expectedTag: string,
  ): Promise<E> {
    try {
      await Effect.runPromise(effect)
      throw new Error(`Expected effect to fail with tag ${expectedTag}, but it succeeded`)
    } catch (error) {
      // Effect-TS wraps errors in FiberFailure, extract the actual error
      let actualError = error
      if (error instanceof Error && error.message.startsWith('{')) {
        try {
          actualError = JSON.parse(error.message)
        } catch {
          // If parsing fails, use the original error
        }
      }

      expect((actualError as E)._tag).toBe(expectedTag)
      return actualError as E
    }
  }
}
```

### 4. Service Composition Testing

```typescript
// Test complex workflows with multiple service calls
const composedEffect = Effect.gen(function* () {
  // Get current settings
  const currentSettings = yield* userService.getSettings(userId)

  // Update settings based on current state
  yield* userService.updateSettings(userId, {
    emailNotifications: !currentSettings.emailNotifications,
  })

  // Get updated settings
  const updatedSettings = yield* userService.getSettings(userId)

  return {
    before: currentSettings,
    after: updatedSettings,
    changed: true,
  }
})

const result = await EffectTestUtils.expectSuccess(composedEffect)
```

## Error Type Testing

### Testing All Error Types in Union

```typescript
// Test each error type in the union
const errorTypes = [
  { error: new UserNotFoundError(userId), tag: 'UserNotFoundError' },
  { error: new ValidationError('Invalid input', 'field'), tag: 'ValidationError' },
  { error: new DatabaseError('DB error'), tag: 'DatabaseError' },
]

for (const { error, tag } of errorTypes) {
  vi.mocked(userService.updateSettings).mockImplementation(() => Effect.fail(error))

  const caughtError = await EffectTestUtils.expectFailureWithTag(
    userService.updateSettings(userId, settings),
    tag,
  )

  expect(caughtError._tag).toBe(tag)
}
```

### Error Property Validation

```typescript
// Validate error properties (not instanceof due to serialization)
const error = await EffectTestUtils.expectFailureWithTag(
  userService.updateSettings(userId, { theme: 'invalid' }),
  'ValidationError',
)

expect(error._tag).toBe('ValidationError')
expect((error as ValidationError).field).toBe('theme')
expect((error as ValidationError).message).toBe('Invalid theme value')
```

## Mock Management

### Consistent Mock Reset

```typescript
beforeEach(() => {
  vi.clearAllMocks()

  // Recreate service mocks with fresh state
  mockUserService = createMockUserService()
})
```

### Custom Mock Implementations

```typescript
// Override mock behavior for specific tests
vi.mocked(userService.getSettings).mockImplementation(() => Effect.succeed(customSettings))
```

## Integration Testing Patterns

### Database Integration

```typescript
// Test with real database operations (mocked at lower level)
it('should integrate with database layer', async () => {
  const { getDatabase } = await import('@/db')

  // Verify mock is working
  expect(vi.isMockFunction(getDatabase)).toBe(true)

  // Use mocked database
  const db = getDatabase()
  const result = await db.select().from({}).where({})

  expect(result).toEqual([{ id: 'test-user', email: 'test@example.com' }])
})
```

### Service Layer Integration

```typescript
// Test service interactions
it('should handle service composition', async () => {
  const workflow = Effect.gen(function* () {
    const user = yield* userService.getSettings(userId)
    yield* notificationService.sendEmail(user.email, notification)
    return { success: true }
  })

  await EffectTestUtils.expectSuccess(workflow)

  expect(userService.getSettings).toHaveBeenCalledWith(userId)
  expect(notificationService.sendEmail).toHaveBeenCalled()
})
```

## Best Practices

### 1. Type Safety

- Always maintain TypeScript type safety in mocks
- Use proper Effect-TS types for error handling
- Validate error properties using \_tag rather than instanceof

### 2. Mock Isolation

- Reset mocks between tests using beforeEach
- Use importOriginal pattern to preserve module structure
- Create focused mocks for specific test scenarios

### 3. Error Testing

- Test all error paths in service methods
- Validate error composition in complex workflows
- Use Effect-TS error handling patterns consistently

### 4. Service Composition

- Test service interactions and dependencies
- Validate error propagation through composed effects
- Ensure proper cleanup and resource management

### 5. Documentation

- Document mock behavior and expectations
- Provide examples for common testing patterns
- Maintain consistency across service tests

## Common Pitfalls

### 1. Effect-TS Error Serialization

- Effect-TS serializes errors as JSON in FiberFailure
- Always extract actual error from wrapped format
- Use \_tag for error type checking, not instanceof

### 2. Mock State Management

- Mocks can retain state between tests
- Always reset mocks in beforeEach
- Be careful with singleton services

### 3. Database Mock Complexity

- Database mocks can become complex quickly
- Focus on testing service logic, not database operations
- Use helper utilities for common mock patterns

### 4. Async Error Handling

- Effect.runPromise properly handles async errors
- Catch and extract errors from FiberFailure wrapper
- Test both success and failure paths

## Example Test Structure

```typescript
describe('UserService', () => {
  let mockUserService: MockUserService

  beforeEach(() => {
    vi.clearAllMocks()
    mockUserService = createMockUserService()
  })

  describe('Success Cases', () => {
    it('should handle successful operations', async () => {
      // Test success scenarios
    })
  })

  describe('Error Cases', () => {
    it('should handle UserNotFoundError', async () => {
      // Test error scenarios
    })
  })

  describe('Service Composition', () => {
    it('should compose multiple services', async () => {
      // Test complex workflows
    })
  })

  describe('Mock Behavior', () => {
    it('should maintain consistent mocks', () => {
      // Test mock consistency
    })
  })
})
```

This testing approach ensures comprehensive coverage of service layer functionality while maintaining type safety and proper Effect-TS error handling patterns.
