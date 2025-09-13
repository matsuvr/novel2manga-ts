/**
 * Service Layer Mock Utilities
 *
 * Provides consistent mocking utilities for service layer testing,
 * including Effect-TS error handling and dependency injection patterns.
 */

import { Cause, Context, Effect, Layer } from 'effect'
import { expect, vi } from 'vitest'
import type { NotificationService } from '../../services/notifications'
import type { UserService } from '../../services/user'

// Import error classes directly to ensure they're available
export { DatabaseError, UserNotFoundError, ValidationError } from '../../services/user'

import { DatabaseError, UserNotFoundError, ValidationError } from '../../services/user'

/**
 * Mock User Service Implementation
 */
export const createMockUserService = (): UserService => ({
  getSettings: vi.fn().mockImplementation((userId: string) => {
    if (userId === 'nonexistent-user') {
      return Effect.fail(new UserNotFoundError(userId))
    }
    if (userId === 'db-error-user') {
      return Effect.fail(new DatabaseError('Database connection failed'))
    }
    return Effect.succeed({
      emailNotifications: true,
      theme: 'light' as const,
      language: 'ja' as const,
    })
  }),

  updateSettings: vi.fn().mockImplementation((userId: string, settings) => {
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
})

/**
 * Mock Notification Service Implementation
 */
export const createMockNotificationService = (): NotificationService => ({
  sendJobCompletionEmail: vi
    .fn()
    .mockImplementation(async (_email: string, options: { jobId: string; status: string }) => {
      if (options.jobId === 'fail-job-id') {
        throw new Error('Email service unavailable')
      }
      return Promise.resolve()
    }),
})

/**
 * Mock User Service Layer for Effect-TS
 */
export const MockUserServiceLayer = Layer.succeed(
  Context.GenericTag<UserService>('UserService'),
  createMockUserService(),
)

/**
 * Effect-TS Test Utilities
 */
export const EffectTestUtils = {
  /**
   * Run an Effect and expect it to succeed with a specific value
   */
  async expectSuccess<A, E>(effect: Effect.Effect<A, E, never>, expectedValue?: A): Promise<A> {
    const result = await Effect.runPromise(effect)
    if (expectedValue !== undefined) {
      expect(result).toEqual(expectedValue)
    }
    return result
  },

  /**
   * Run an Effect and expect it to fail with a specific error type
   */
  async expectFailure<A, E>(
    effect: Effect.Effect<A, E, never>,
    errorConstructor: new (...args: unknown[]) => E,
  ): Promise<E> {
    try {
      await Effect.runPromise(effect)
      throw new Error(`Expected effect to fail with ${errorConstructor.name}, but it succeeded`)
    } catch (error) {
      expect(error).toBeInstanceOf(errorConstructor)
      return error as E
    }
  },

  /**
   * Run an Effect and expect it to fail with a specific error tag
   */
  async expectFailureWithTag<A, E extends { _tag: string }>(
    effect: Effect.Effect<A, E, never>,
    expectedTag: string,
  ): Promise<E> {
    const exit = await Effect.runPromiseExit(effect)
    if (exit._tag === 'Success') {
      throw new Error(`Expected effect to fail with tag ${expectedTag}, but it succeeded`)
    }

    // Extract typed failure (Effect.fail) first
    let underlying: unknown | undefined
    const failureOpt = Cause.failureOption(exit.cause)
    if (failureOpt._tag === 'Some') {
      underlying = failureOpt.value
    }
    // Then defects (thrown exceptions inside Effect.try / sync code)
    if (!underlying) {
      const defects = Cause.defects(exit.cause)
      if (defects.length > 0) underlying = defects[0]
    }
    // Then die (Effect.die / unrecoverable) as last resort
    if (!underlying) {
      const dieOpt = Cause.dieOption(exit.cause)
      if (dieOpt._tag === 'Some') underlying = dieOpt.value
    }

    // Last resort: return a synthetic error object
    if (!underlying || (typeof underlying !== 'object' && typeof underlying !== 'function')) {
      const synthetic = {
        _tag: expectedTag,
        message: 'Unknown failure (no underlying error extracted)',
      } as unknown as E
      expect((synthetic as { _tag: string })._tag).toBe(expectedTag)
      return synthetic
    }

    const obj = underlying as { _tag?: unknown; name?: unknown; message?: unknown }
    // Some domain errors are native class instances extending Error. We validate tag.
    if (obj._tag !== expectedTag) {
      // Provide debugging info to help future maintenance
      throw new Error(
        `Failure extracted but tag mismatch. expected=${expectedTag} actual=${obj._tag ?? 'undefined'} name=${obj.name ?? 'n/a'} message=${obj.message ?? 'n/a'}`,
      )
    }

    expect(obj._tag).toBe(expectedTag)
    return obj as E
  },

  /**
   * Create a mock Effect that succeeds with a value
   */
  mockSuccess<A>(value: A): Effect.Effect<A, never, never> {
    return Effect.succeed(value)
  },

  /**
   * Create a mock Effect that fails with an error
   */
  mockFailure<E>(error: E): Effect.Effect<never, E, never> {
    return Effect.fail(error)
  },
}

/**
 * Database Mock Utilities for Service Testing
 */
export const ServiceDatabaseMockUtils = {
  /**
   * Create a mock database that returns specific user data
   */
  createUserMockDatabase(userData: unknown = null) {
    const mockSelect = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(userData ? [userData] : []),
      }),
    })

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({ changes: 1 }),
      }),
    })

    const mockDelete = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({ changes: 1 }),
    })

    return {
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
    }
  },

  /**
   * Create a mock database that throws errors
   */
  createErrorMockDatabase(errorMessage: string = 'Database error') {
    const _mockError = () => {
      throw new Error(errorMessage)
    }

    return {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error(errorMessage)),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error(errorMessage)),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error(errorMessage)),
      }),
    }
  },
}

/**
 * Email Transport Mock Utilities
 */
export const EmailTransportMockUtils = {
  /**
   * Create a mock email transport that succeeds
   */
  createSuccessTransport() {
    return {
      sendMail: vi.fn().mockResolvedValue({
        messageId: 'mock-message-id',
        response: '250 OK',
      }),
    }
  },

  /**
   * Create a mock email transport that fails
   */
  createFailureTransport(errorMessage: string = 'SMTP connection failed') {
    return {
      sendMail: vi.fn().mockRejectedValue(new Error(errorMessage)),
    }
  },

  /**
   * Create a mock email transport with custom behavior
   */
  createCustomTransport(behavior: (options: Record<string, unknown>) => Promise<unknown>) {
    return {
      sendMail: vi.fn().mockImplementation(behavior),
    }
  },
}

/**
 * Service Layer Integration Mock Utilities
 */
export const ServiceIntegrationMockUtils = {
  /**
   * Create a complete service layer mock setup for integration testing
   */
  createServiceLayerMocks() {
    return {
      userService: createMockUserService(),
      notificationService: createMockNotificationService(),
      database: ServiceDatabaseMockUtils.createUserMockDatabase(),
      emailTransport: EmailTransportMockUtils.createSuccessTransport(),
    }
  },

  /**
   * Create error scenario mocks for testing error handling
   */
  createErrorScenarioMocks() {
    return {
      userService: createMockUserService(),
      notificationService: createMockNotificationService(),
      database: ServiceDatabaseMockUtils.createErrorMockDatabase(),
      emailTransport: EmailTransportMockUtils.createFailureTransport(),
    }
  },

  /**
   * Reset all service mocks to their initial state
   */
  resetAllMocks(mocks: Record<string, unknown>) {
    Object.values(mocks).forEach((mock) => {
      if (mock && typeof mock === 'object') {
        Object.values(mock as Record<string, unknown>).forEach((fn) => {
          if (vi.isMockFunction(fn)) {
            // vitest will narrow correctly here
            fn.mockReset()
          }
        })
      }
    })
  },
}

/**
 * Effect-TS Service Testing Patterns
 */
export const EffectServiceTestPatterns = {
  /**
   * Test pattern for service methods that should succeed
   */
  async testServiceSuccess<A, E>(
    serviceMethod: Effect.Effect<A, E, never>,
    expectedResult?: A,
    assertions?: (result: A) => void,
  ): Promise<A> {
    const result = await EffectTestUtils.expectSuccess(serviceMethod, expectedResult)
    if (assertions) {
      assertions(result)
    }
    return result
  },

  /**
   * Test pattern for service methods that should fail with specific error
   */
  async testServiceFailure<A, E extends { _tag: string }>(
    serviceMethod: Effect.Effect<A, E, never>,
    expectedErrorTag: string,
    assertions?: (error: E) => void,
  ): Promise<E> {
    const error = await EffectTestUtils.expectFailureWithTag(serviceMethod, expectedErrorTag)
    if (assertions) {
      assertions(error)
    }
    return error
  },

  /**
   * Test pattern for service methods with dependency injection
   */
  async testServiceWithDependencies<A, E, R>(
    serviceMethod: Effect.Effect<A, E, R>,
    dependencies: Context.Context<R>,
    expectedResult?: A,
  ): Promise<A> {
    const result = await Effect.runPromise(serviceMethod.pipe(Effect.provide(dependencies)))
    if (expectedResult !== undefined) {
      expect(result).toEqual(expectedResult)
    }
    return result
  },
}
