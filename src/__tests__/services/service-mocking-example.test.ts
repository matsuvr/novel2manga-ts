/**
 * Service Layer Mocking Example Tests
 *
 * Demonstrates proper service layer test mocking patterns with Effect-TS
 * and database dependency mocking using importOriginal pattern.
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock error classes for testing
class DatabaseError {
  readonly _tag = 'DatabaseError'
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {}
}

class UserNotFoundError {
  readonly _tag = 'UserNotFoundError'
  constructor(readonly userId: string) {}
}

class ValidationError {
  readonly _tag = 'ValidationError'
  constructor(
    readonly message: string,
    readonly field?: string,
  ) {}
}

// Mock service interface
interface MockUserService {
  getSettings: (userId: string) => Effect.Effect<any, DatabaseError | UserNotFoundError, never>
  updateSettings: (
    userId: string,
    settings: any,
  ) => Effect.Effect<void, DatabaseError | UserNotFoundError | ValidationError, never>
  deleteAccount: (userId: string) => Effect.Effect<void, DatabaseError | UserNotFoundError, never>
}

// Effect test utilities
class EffectTestUtils {
  static async expectSuccess<A, E>(
    effect: Effect.Effect<A, E, never>,
    expectedValue?: A,
  ): Promise<A> {
    const result = await Effect.runPromise(effect)
    if (expectedValue !== undefined) {
      expect(result).toEqual(expectedValue)
    }
    return result
  }

  static async expectFailureWithTag<A, E extends { _tag: string }>(
    effect: Effect.Effect<A, E, never>,
    expectedTag: string,
  ): Promise<E> {
    try {
      const result = await Effect.runPromise(effect)
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

// Mock database using importOriginal pattern
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()

  return {
    ...actual,
    getDatabase: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'test-user', email: 'test@example.com' }]),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ changes: 1 }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      }),
    }),
  }
})

describe('Service Layer Mocking Patterns', () => {
  let mockUserService: MockUserService

  beforeEach(() => {
    vi.clearAllMocks()

    // Create mock service with proper Effect-TS error handling
    mockUserService = {
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

      updateSettings: vi.fn().mockImplementation((userId: string, settings: any) => {
        if (userId === 'nonexistent-user') {
          return Effect.fail(new UserNotFoundError(userId))
        }
        if (settings.theme && !['light', 'dark'].includes(settings.theme)) {
          return Effect.fail(new ValidationError('Invalid theme value', 'theme'))
        }
        if (userId === 'db-error-user') {
          return Effect.fail(new DatabaseError('Database update failed'))
        }
        return Effect.succeed(undefined)
      }),

      deleteAccount: vi.fn().mockImplementation((userId: string) => {
        if (userId === 'nonexistent-user') {
          return Effect.fail(new UserNotFoundError(userId))
        }
        if (userId === 'db-error-user') {
          return Effect.fail(new DatabaseError('Database delete failed'))
        }
        return Effect.succeed(undefined)
      }),
    }
  })

  describe('Success Cases', () => {
    it('should handle successful service operations', async () => {
      // Test getSettings success
      const settings = await EffectTestUtils.expectSuccess(
        mockUserService.getSettings('valid-user'),
        {
          emailNotifications: true,
          theme: 'light',
          language: 'ja',
        },
      )

      expect(settings.emailNotifications).toBe(true)
      expect(mockUserService.getSettings).toHaveBeenCalledWith('valid-user')

      // Test updateSettings success
      await EffectTestUtils.expectSuccess(
        mockUserService.updateSettings('valid-user', { theme: 'dark' }),
      )

      expect(mockUserService.updateSettings).toHaveBeenCalledWith('valid-user', { theme: 'dark' })

      // Test deleteAccount success
      await EffectTestUtils.expectSuccess(mockUserService.deleteAccount('valid-user'))

      expect(mockUserService.deleteAccount).toHaveBeenCalledWith('valid-user')
    })
  })

  describe('Error Cases', () => {
    it('should handle UserNotFoundError properly', async () => {
      const userId = 'nonexistent-user'

      // Test getSettings UserNotFoundError
      const getError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.getSettings(userId),
        'UserNotFoundError',
      )
      expect(getError._tag).toBe('UserNotFoundError')
      expect((getError as UserNotFoundError).userId).toBe(userId)

      // Test updateSettings UserNotFoundError
      const updateError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.updateSettings(userId, { theme: 'dark' }),
        'UserNotFoundError',
      )
      expect(updateError._tag).toBe('UserNotFoundError')

      // Test deleteAccount UserNotFoundError
      const deleteError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.deleteAccount(userId),
        'UserNotFoundError',
      )
      expect(deleteError._tag).toBe('UserNotFoundError')
    })

    it('should handle DatabaseError properly', async () => {
      const userId = 'db-error-user'

      // Test getSettings DatabaseError
      const getError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.getSettings(userId),
        'DatabaseError',
      )
      expect(getError._tag).toBe('DatabaseError')
      expect((getError as DatabaseError).message).toBe('Database connection failed')

      // Test updateSettings DatabaseError
      const updateError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.updateSettings(userId, { theme: 'dark' }),
        'DatabaseError',
      )
      expect(updateError._tag).toBe('DatabaseError')

      // Test deleteAccount DatabaseError
      const deleteError = await EffectTestUtils.expectFailureWithTag(
        mockUserService.deleteAccount(userId),
        'DatabaseError',
      )
      expect(deleteError._tag).toBe('DatabaseError')
    })

    it('should handle ValidationError properly', async () => {
      const userId = 'valid-user'
      const invalidSettings = { theme: 'invalid-theme' }

      const error = await EffectTestUtils.expectFailureWithTag(
        mockUserService.updateSettings(userId, invalidSettings),
        'ValidationError',
      )

      expect(error._tag).toBe('ValidationError')
      expect((error as ValidationError).field).toBe('theme')
      expect((error as ValidationError).message).toBe('Invalid theme value')
    })
  })

  describe('Effect-TS Composition', () => {
    it('should compose multiple service calls with proper error handling', async () => {
      const userId = 'valid-user'

      const composedEffect = Effect.gen(function* () {
        // Get current settings
        const currentSettings = yield* mockUserService.getSettings(userId)

        // Update settings
        yield* mockUserService.updateSettings(userId, {
          emailNotifications: !currentSettings.emailNotifications,
        })

        // Get updated settings
        const updatedSettings = yield* mockUserService.getSettings(userId)

        return {
          before: currentSettings,
          after: updatedSettings,
          changed: true,
        }
      })

      const result = await EffectTestUtils.expectSuccess(composedEffect)

      expect(result.changed).toBe(true)
      expect(mockUserService.getSettings).toHaveBeenCalledTimes(2)
      expect(mockUserService.updateSettings).toHaveBeenCalledTimes(1)
    })

    it('should handle errors in composed effects', async () => {
      const userId = 'nonexistent-user'

      const composedEffect = Effect.gen(function* () {
        // This will fail with UserNotFoundError
        const settings = yield* mockUserService.getSettings(userId)

        // This won't be reached
        yield* mockUserService.updateSettings(userId, settings)

        return { success: true }
      })

      const error = await EffectTestUtils.expectFailureWithTag(composedEffect, 'UserNotFoundError')

      expect(error._tag).toBe('UserNotFoundError')
      expect(mockUserService.getSettings).toHaveBeenCalledWith(userId)
      // updateSettings should not be called due to early failure
      expect(mockUserService.updateSettings).not.toHaveBeenCalled()
    })
  })

  describe('Database Mock Integration', () => {
    it('should demonstrate database mocking with importOriginal pattern', async () => {
      // This test shows how database mocks would be used in real service tests
      const { getDatabase } = await import('@/db')

      // Verify the mock is working
      expect(vi.isMockFunction(getDatabase)).toBe(true)

      // Use the mocked database
      const db = getDatabase()
      const result = await db.select().from({}).where({})

      expect(result).toEqual([{ id: 'test-user', email: 'test@example.com' }])
      expect(db.select).toHaveBeenCalled()
    })
  })

  describe('Service Mock Utilities', () => {
    it('should provide consistent mock behavior', () => {
      // Verify all methods are properly mocked
      expect(vi.isMockFunction(mockUserService.getSettings)).toBe(true)
      expect(vi.isMockFunction(mockUserService.updateSettings)).toBe(true)
      expect(vi.isMockFunction(mockUserService.deleteAccount)).toBe(true)
    })

    it('should allow custom mock implementations', async () => {
      // Override mock behavior for specific test
      const customSettings = {
        emailNotifications: false,
        theme: 'dark',
        language: 'en',
      }

      vi.mocked(mockUserService.getSettings).mockImplementation(() =>
        Effect.succeed(customSettings),
      )

      const result = await EffectTestUtils.expectSuccess(mockUserService.getSettings('any-user'))

      expect(result).toEqual(customSettings)
    })

    it('should reset mocks between tests', () => {
      // This test verifies that beforeEach properly resets mocks
      expect(mockUserService.getSettings).not.toHaveBeenCalled()
      expect(mockUserService.updateSettings).not.toHaveBeenCalled()
      expect(mockUserService.deleteAccount).not.toHaveBeenCalled()
    })
  })
})
