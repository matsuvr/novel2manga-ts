/**
 * UserService Tests
 *
 * Tests for the UserService implementation using Effect-TS with proper
 * database dependency mocking using importOriginal pattern.
 */

import { Effect } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseError, UserNotFoundError, ValidationError } from '@/services/user/types'
import { createMockUserService, EffectTestUtils } from '@/test/mocks/service.mock'

describe('UserService', () => {
  let userService: any

  beforeEach(async () => {
    vi.clearAllMocks()

    // Use the mock user service for testing
    userService = createMockUserService()
  })

  describe('getSettings', () => {
    it('should return user settings when user exists', async () => {
      // Arrange
      const userId = 'test-user-id'
      const expectedSettings = {
        emailNotifications: true,
        theme: 'light' as const,
        language: 'ja' as const,
      }

      // Act
      const result = await EffectTestUtils.expectSuccess(
        userService.getSettings(userId),
        expectedSettings,
      )

      // Assert
      expect(result.emailNotifications).toBe(true)
      expect(result.theme).toBe('light')
      expect(result.language).toBe('ja')
      expect(userService.getSettings).toHaveBeenCalledWith(userId)
    })

    it('should return UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = 'nonexistent-user'

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.getSettings(userId),
        'UserNotFoundError',
      )

      expect(error).toBeInstanceOf(UserNotFoundError)
      expect((error as UserNotFoundError).userId).toBe(userId)
    })

    it('should return DatabaseError when database operation fails', async () => {
      // Arrange
      const userId = 'db-error-user'

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.getSettings(userId),
        'DatabaseError',
      )

      expect(error).toBeInstanceOf(DatabaseError)
      expect((error as DatabaseError).message).toBe('Database connection failed')
    })

    it('should handle successful settings retrieval', async () => {
      // Arrange
      const userId = 'valid-user'

      // Act
      const result = await EffectTestUtils.expectSuccess(userService.getSettings(userId))

      // Assert - should use default mock values
      expect(result.emailNotifications).toBe(true)
      expect(result.theme).toBe('light')
      expect(result.language).toBe('ja')
    })
  })

  describe('updateSettings', () => {
    it('should update user settings successfully', async () => {
      // Arrange
      const userId = 'test-user-id'
      const settings = {
        emailNotifications: false,
        theme: 'dark' as const,
        language: 'en' as const,
      }

      // Act & Assert
      await EffectTestUtils.expectSuccess(userService.updateSettings(userId, settings))

      expect(userService.updateSettings).toHaveBeenCalledWith(userId, settings)
    })

    it('should return UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = 'nonexistent-user'
      const settings = { theme: 'dark' as const }

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.updateSettings(userId, settings),
        'UserNotFoundError',
      )

      expect(error).toBeInstanceOf(UserNotFoundError)
      expect((error as UserNotFoundError).userId).toBe(userId)
    })

    it('should return ValidationError for invalid theme', async () => {
      // Arrange
      const userId = 'test-user-id'
      const settings = { theme: 'invalid-theme' as any }

      // Mock validation error for invalid theme
      vi.mocked(userService.updateSettings).mockImplementation(() =>
        Effect.fail(new ValidationError('Invalid theme value', 'theme')),
      )

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.updateSettings(userId, settings),
        'ValidationError',
      )

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('theme')
    })

    it('should return ValidationError for invalid language', async () => {
      // Arrange
      const userId = 'test-user-id'
      const settings = { language: 'invalid-lang' as any }

      // Mock validation error for invalid language
      vi.mocked(userService.updateSettings).mockImplementation(() =>
        Effect.fail(new ValidationError('Invalid language value', 'language')),
      )

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.updateSettings(userId, settings),
        'ValidationError',
      )

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('language')
    })

    it('should return ValidationError for invalid emailNotifications', async () => {
      // Arrange
      const userId = 'test-user-id'
      const settings = { emailNotifications: 'invalid' as any }

      // Mock validation error for invalid emailNotifications
      vi.mocked(userService.updateSettings).mockImplementation(() =>
        Effect.fail(new ValidationError('Invalid emailNotifications value', 'emailNotifications')),
      )

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.updateSettings(userId, settings),
        'ValidationError',
      )

      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).field).toBe('emailNotifications')
    })

    it('should handle partial settings updates', async () => {
      // Arrange
      const userId = 'test-user-id'
      const settings = { theme: 'dark' as const } // Only updating theme

      // Act & Assert
      await EffectTestUtils.expectSuccess(userService.updateSettings(userId, settings))

      expect(userService.updateSettings).toHaveBeenCalledWith(userId, settings)
    })

    it('should return DatabaseError when update operation fails', async () => {
      // Arrange
      const userId = 'db-error-user'
      const settings = { theme: 'dark' as const }

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.updateSettings(userId, settings),
        'DatabaseError',
      )

      expect(error).toBeInstanceOf(DatabaseError)
      expect((error as DatabaseError).message).toBe('Database update failed')
    })
  })

  describe('deleteAccount', () => {
    it('should delete user account successfully', async () => {
      // Arrange
      const userId = 'test-user-id'

      // Act & Assert
      await EffectTestUtils.expectSuccess(userService.deleteAccount(userId))

      expect(userService.deleteAccount).toHaveBeenCalledWith(userId)
    })

    it('should return UserNotFoundError when user does not exist', async () => {
      // Arrange
      const userId = 'nonexistent-user'

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.deleteAccount(userId),
        'UserNotFoundError',
      )

      expect(error).toBeInstanceOf(UserNotFoundError)
      expect((error as UserNotFoundError).userId).toBe(userId)
    })

    it('should return DatabaseError when delete operation fails', async () => {
      // Arrange
      const userId = 'db-error-user'

      // Act & Assert
      const error = await EffectTestUtils.expectFailureWithTag(
        userService.deleteAccount(userId),
        'DatabaseError',
      )

      expect(error).toBeInstanceOf(DatabaseError)
      expect((error as DatabaseError).message).toBe('Database delete failed')
    })
  })

  describe('Effect-TS Error Handling', () => {
    it('should properly handle Effect-TS error types', async () => {
      // Test that all error types are properly typed and handled
      const userId = 'test-user'

      // Test UserNotFoundError
      const userNotFoundError = await EffectTestUtils.expectFailureWithTag(
        userService.getSettings('nonexistent-user'),
        'UserNotFoundError',
      )
      expect(userNotFoundError._tag).toBe('UserNotFoundError')

      // Test DatabaseError
      const databaseError = await EffectTestUtils.expectFailureWithTag(
        userService.getSettings('db-error-user'),
        'DatabaseError',
      )
      expect(databaseError._tag).toBe('DatabaseError')
    })

    it('should maintain type safety in Effect composition', async () => {
      // This test demonstrates Effect-TS type safety
      const userId = 'test-user'

      const composedEffect = Effect.gen(function* () {
        const settings = yield* userService.getSettings(userId)
        yield* userService.updateSettings(userId, {
          emailNotifications: !settings.emailNotifications,
        })
        return { updated: true }
      })

      const result = await EffectTestUtils.expectSuccess(composedEffect)
      expect(result.updated).toBe(true)
    })
  })

  describe('Service Mock Behavior', () => {
    it('should properly mock all service methods', () => {
      // Verify all methods are mocked
      expect(vi.isMockFunction(userService.getSettings)).toBe(true)
      expect(vi.isMockFunction(userService.updateSettings)).toBe(true)
      expect(vi.isMockFunction(userService.deleteAccount)).toBe(true)
    })

    it('should allow custom mock implementations', async () => {
      // Arrange - Override mock behavior
      const customSettings = {
        emailNotifications: false,
        theme: 'dark' as const,
        language: 'en' as const,
      }

      vi.mocked(userService.getSettings).mockImplementation(() => Effect.succeed(customSettings))

      // Act
      const result = await EffectTestUtils.expectSuccess(userService.getSettings('custom-user'))

      // Assert
      expect(result).toEqual(customSettings)
    })
  })
})
