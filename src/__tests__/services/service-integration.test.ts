/**
 * Service Integration Tests
 *
 * Tests for service layer integration patterns, demonstrating proper
 * Effect-TS error handling and service composition.
 */

import { Context, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationService } from '@/services/notifications'
import { UserService } from '@/services/user/service'
import { DatabaseError, UserNotFoundError, ValidationError } from '@/services/user/types'
import {
  createMockNotificationService,
  createMockUserService,
  EffectServiceTestPatterns,
  EffectTestUtils,
  ServiceIntegrationMockUtils,
} from '@/test/mocks/service.mock'

// Mock all service dependencies
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>()
  return {
    ...actual,
    getDatabase: vi.fn(),
  }
})

vi.mock('@/services/notifications', () => ({
  getNotificationService: vi.fn(),
}))

describe('Service Integration', () => {
  let mocks: any
  let userService: UserService
  let notificationService: NotificationService

  beforeEach(async () => {
    vi.clearAllMocks()

    // Set up comprehensive service mocks
    mocks = ServiceIntegrationMockUtils.createServiceLayerMocks()

    // Configure database mock
    const { getDatabase } = await import('@/db')
    vi.mocked(getDatabase).mockReturnValue(mocks.database)

    // Configure notification service mock
    const { getNotificationService } = await import('@/services/notifications')
    vi.mocked(getNotificationService).mockReturnValue(mocks.notificationService)

    // Create service instances
    userService = mocks.userService
    notificationService = mocks.notificationService
  })

  afterEach(() => {
    ServiceIntegrationMockUtils.resetAllMocks(mocks)
  })

  describe('User Settings Management with Notifications', () => {
    it('should update user settings and send notification on success', async () => {
      // Arrange
      const userId = 'test-user-id'
      const userEmail = 'user@example.com'
      const newSettings = {
        emailNotifications: true,
        theme: 'dark' as const,
      }

      // Mock successful user settings update
      vi.mocked(userService.updateSettings).mockImplementation(() => Effect.succeed(undefined))

      // Act - Simulate a workflow that updates settings and sends notification
      const workflow = Effect.gen(function* () {
        // Update user settings
        yield* userService.updateSettings(userId, newSettings)

        // Send notification about settings change
        yield* Effect.tryPromise({
          try: () =>
            notificationService.sendJobCompletionEmail(userEmail, {
              jobId: 'settings-update',
              status: 'completed',
            }),
          catch: (error) => new DatabaseError(`Notification failed: ${String(error)}`),
        })

        return { success: true }
      })

      // Assert
      await EffectServiceTestPatterns.testServiceSuccess(workflow, { success: true }, (result) => {
        expect(result.success).toBe(true)
        expect(userService.updateSettings).toHaveBeenCalledWith(userId, newSettings)
        expect(notificationService.sendJobCompletionEmail).toHaveBeenCalledWith(
          userEmail,
          expect.objectContaining({
            jobId: 'settings-update',
            status: 'completed',
          }),
        )
      })
    })

    it('should handle user settings update failure gracefully', async () => {
      // Arrange
      const userId = 'nonexistent-user'
      const newSettings = { theme: 'dark' as const }

      // Mock user not found error
      vi.mocked(userService.updateSettings).mockImplementation(() =>
        Effect.fail(new UserNotFoundError(userId)),
      )

      // Act - Simulate workflow that handles user not found
      const workflow = Effect.gen(function* () {
        const result = yield* userService
          .updateSettings(userId, newSettings)
          .pipe(
            Effect.catchTag('UserNotFoundError', (error) =>
              Effect.succeed({ error: 'User not found', userId: error.userId }),
            ),
          )
        return result
      })

      // Assert
      await EffectServiceTestPatterns.testServiceSuccess(workflow, undefined, (result) => {
        expect(result).toEqual({
          error: 'User not found',
          userId: userId,
        })
      })
    })

    it('should handle validation errors with proper error propagation', async () => {
      // Arrange
      const userId = 'test-user-id'
      const invalidSettings = { theme: 'invalid-theme' as any }

      // Mock validation error
      vi.mocked(userService.updateSettings).mockImplementation(() =>
        Effect.fail(new ValidationError('Invalid theme value', 'theme')),
      )

      // Act & Assert
      await EffectServiceTestPatterns.testServiceFailure(
        userService.updateSettings(userId, invalidSettings),
        'ValidationError',
        (error) => {
          expect(error.field).toBe('theme')
          expect(error.message).toBe('Invalid theme value')
        },
      )
    })
  })

  describe('Service Composition Patterns', () => {
    it('should compose multiple services with proper error handling', async () => {
      // Arrange
      const userId = 'test-user-id'

      // Mock successful operations
      vi.mocked(userService.getSettings).mockImplementation(() =>
        Effect.succeed({
          emailNotifications: true,
          theme: 'light',
          language: 'ja',
        }),
      )

      vi.mocked(userService.updateSettings).mockImplementation(() => Effect.succeed(undefined))

      // Act - Compose services in a workflow
      const composedWorkflow = Effect.gen(function* () {
        // Get current settings
        const currentSettings = yield* userService.getSettings(userId)

        // Update theme if it's light
        if (currentSettings.theme === 'light') {
          yield* userService.updateSettings(userId, { theme: 'dark' })
        }

        // Get updated settings
        const updatedSettings = yield* userService.getSettings(userId)

        return {
          before: currentSettings,
          after: updatedSettings,
          changed: currentSettings.theme !== updatedSettings.theme,
        }
      })

      // Assert
      await EffectServiceTestPatterns.testServiceSuccess(composedWorkflow, undefined, (result) => {
        expect(result.before.theme).toBe('light')
        expect(userService.getSettings).toHaveBeenCalledTimes(2)
        expect(userService.updateSettings).toHaveBeenCalledWith(userId, { theme: 'dark' })
      })
    })

    it('should handle service dependency failures in composition', async () => {
      // Arrange
      const userId = 'db-error-user'

      // Mock database error
      vi.mocked(userService.getSettings).mockImplementation(() =>
        Effect.fail(new DatabaseError('Database connection failed')),
      )

      // Act - Compose services with error recovery
      const resilientWorkflow = Effect.gen(function* () {
        const settingsResult = yield* userService.getSettings(userId).pipe(
          Effect.catchTag('DatabaseError', (error) =>
            Effect.succeed({
              emailNotifications: false,
              theme: 'light' as const,
              language: 'ja' as const,
              error: error.message,
            }),
          ),
        )

        return settingsResult
      })

      // Assert
      await EffectServiceTestPatterns.testServiceSuccess(resilientWorkflow, undefined, (result) => {
        expect(result.error).toBe('Database connection failed')
        expect(result.theme).toBe('light') // fallback value
      })
    })
  })

  describe('Effect-TS Error Type Safety', () => {
    it('should maintain type safety across service boundaries', async () => {
      // Arrange
      const userId = 'test-user-id'

      // This test demonstrates that Effect-TS maintains type safety
      // even when composing multiple services with different error types

      const typeSafeWorkflow = Effect.gen(function* () {
        // This will have type Effect<UserSettings, DatabaseError | UserNotFoundError>
        const settings = yield* userService.getSettings(userId)

        // This will have type Effect<void, DatabaseError | UserNotFoundError | ValidationError>
        yield* userService.updateSettings(userId, {
          emailNotifications: !settings.emailNotifications,
        })

        return { toggled: true }
      })

      // Mock successful operations
      vi.mocked(userService.getSettings).mockImplementation(() =>
        Effect.succeed({
          emailNotifications: false,
          theme: 'light',
          language: 'ja',
        }),
      )

      vi.mocked(userService.updateSettings).mockImplementation(() => Effect.succeed(undefined))

      // Act & Assert
      await EffectServiceTestPatterns.testServiceSuccess(typeSafeWorkflow, { toggled: true })
    })

    it('should handle all possible error types in union', async () => {
      // This test ensures that all error types in the union are properly handled
      const userId = 'test-user-id'
      const settings = { theme: 'dark' as const }

      // Test each error type
      const errorTypes = [
        { error: new UserNotFoundError(userId), tag: 'UserNotFoundError' },
        { error: new ValidationError('Invalid input', 'field'), tag: 'ValidationError' },
        { error: new DatabaseError('DB error'), tag: 'DatabaseError' },
      ]

      for (const { error, tag } of errorTypes) {
        // Arrange
        vi.mocked(userService.updateSettings).mockImplementation(() => Effect.fail(error))

        // Act & Assert
        await EffectServiceTestPatterns.testServiceFailure(
          userService.updateSettings(userId, settings),
          tag,
          (caughtError) => {
            expect(caughtError._tag).toBe(tag)
          },
        )
      }
    })
  })

  describe('Service Mock Consistency', () => {
    it('should maintain consistent mock behavior across test runs', async () => {
      // This test ensures that mocks are properly reset and configured
      const userId = 'consistency-test-user'

      // First run
      vi.mocked(userService.getSettings).mockImplementation(() =>
        Effect.succeed({
          emailNotifications: true,
          theme: 'light',
          language: 'ja',
        }),
      )

      const result1 = await EffectTestUtils.expectSuccess(userService.getSettings(userId))

      // Reset and reconfigure
      ServiceIntegrationMockUtils.resetAllMocks(mocks)
      vi.mocked(userService.getSettings).mockImplementation(() =>
        Effect.succeed({
          emailNotifications: false,
          theme: 'dark',
          language: 'en',
        }),
      )

      const result2 = await EffectTestUtils.expectSuccess(userService.getSettings(userId))

      // Assert that results are different (proving reset worked)
      expect(result1.emailNotifications).toBe(true)
      expect(result2.emailNotifications).toBe(false)
      expect(result1.theme).toBe('light')
      expect(result2.theme).toBe('dark')
    })
  })
})
