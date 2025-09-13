/**
 * Test Error Utilities
 *
 * Provides utilities for testing error scenarios consistently
 * across all test types including Effect-TS error handling.
 */

import { Effect } from 'effect'
import { expect } from 'vitest'

/**
 * Test utilities for consistent error testing
 */
export const TestErrorUtils = {
  /**
   * Test that an Effect fails with a specific error type
   */
  async expectEffectError<E>(
    effect: Effect.Effect<unknown, E, unknown>,
    errorType: new (...args: unknown[]) => E,
  ): Promise<E> {
    try {
      // Use a typed wrapper to run Effect and avoid broad `any` casts
      const runEffect = Effect.runPromise as unknown as (
        eff: Effect.Effect<unknown, unknown, unknown>,
      ) => Promise<unknown>
      await runEffect(effect as unknown as Effect.Effect<unknown, unknown, unknown>)
      throw new Error('Expected effect to fail but it succeeded')
    } catch (error) {
      expect(error).toBeInstanceOf(errorType)
      return error as E
    }
  },

  /**
   * Test that an Effect fails with a specific error tag
   */
  async expectEffectErrorWithTag<E extends { _tag: string }>(
    effect: Effect.Effect<unknown, E, unknown>,
    expectedTag: string,
  ): Promise<E> {
    try {
      const runEffect = Effect.runPromise as unknown as (
        eff: Effect.Effect<unknown, unknown, unknown>,
      ) => Promise<unknown>
      await runEffect(effect as unknown as Effect.Effect<unknown, unknown, unknown>)
      throw new Error('Expected effect to fail but it succeeded')
    } catch (error) {
      expect(error).toHaveProperty('_tag', expectedTag)
      return error as E
    }
  },

  /**
   * Test that an API response contains a specific error
   */
  async expectApiError(response: Response, errorCode: string): Promise<unknown> {
    expect(response.ok).toBe(false)
    const body = await response.json()
    expect(body).toHaveProperty('error')
    expect(body.error).toHaveProperty('code', errorCode)
    return body.error
  },

  /**
   * Test that a database operation throws a specific error
   */
  async expectDatabaseError(
    operation: () => Promise<unknown>,
    errorMessage: string,
  ): Promise<Error> {
    try {
      await operation()
      throw new Error('Expected database operation to fail but it succeeded')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(errorMessage)
      return error as Error
    }
  },

  /**
   * Test that a function throws synchronously with a specific error type
   */
  expectSyncError<E extends Error>(fn: () => unknown, errorType: new (...args: unknown[]) => E): E {
    try {
      fn()
      throw new Error('Expected function to throw but it succeeded')
    } catch (error) {
      expect(error).toBeInstanceOf(errorType)
      return error as E
    }
  },

  /**
   * Test that a function throws synchronously with a specific message
   */
  expectSyncErrorWithMessage(fn: () => unknown, expectedMessage: string): Error {
    try {
      fn()
      throw new Error('Expected function to throw but it succeeded')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(expectedMessage)
      return error as Error
    }
  },

  /**
   * Test that an async function rejects with a specific error type
   */
  async expectAsyncError<E extends Error>(
    promise: Promise<unknown>,
    errorType: new (...args: unknown[]) => E,
  ): Promise<E> {
    try {
      await promise
      throw new Error('Expected promise to reject but it resolved')
    } catch (error) {
      expect(error).toBeInstanceOf(errorType)
      return error as E
    }
  },

  /**
   * Test that an async function rejects with a specific message
   */
  async expectAsyncErrorWithMessage(
    promise: Promise<unknown>,
    expectedMessage: string,
  ): Promise<Error> {
    try {
      await promise
      throw new Error('Expected promise to reject but it resolved')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain(expectedMessage)
      return error as Error
    }
  },

  /**
   * Create a mock error for testing
   */
  createMockError(message: string, code?: string): Error & { code?: string } {
    const error = new Error(message) as Error & { code?: string }
    if (code) {
      error.code = code
    }
    return error
  },

  /**
   * Create a mock database error for testing
   */
  createMockDatabaseError(message: string): Error & { _tag: string } {
    const error = new Error(message) as Error & { _tag: string }
    error._tag = 'DatabaseError'
    return error
  },

  /**
   * Create a mock validation error for testing
   */
  createMockValidationError(
    message: string,
    field?: string,
  ): Error & { _tag: string; field?: string } {
    const error = new Error(message) as Error & { _tag: string; field?: string }
    error._tag = 'ValidationError'
    if (field) {
      error.field = field
    }
    return error
  },

  /**
   * Create a mock authentication error for testing
   */
  createMockAuthError(message: string): Error & { _tag: string } {
    const error = new Error(message) as Error & { _tag: string }
    error._tag = 'AuthenticationError'
    return error
  },

  /**
   * Create a mock user not found error for testing
   */
  createMockUserNotFoundError(userId: string): Error & { _tag: string; userId: string } {
    const error = new Error(`User not found: ${userId}`) as Error & { _tag: string; userId: string }
    error._tag = 'UserNotFoundError'
    error.userId = userId
    return error
  },

  /**
   * Assert that an error has the expected structure for Effect-TS errors
   */
  assertEffectError<E extends { _tag: string }>(
    error: unknown,
    expectedTag: string,
    additionalChecks?: (error: E) => void,
  ): asserts error is E {
    expect(error).toBeDefined()
    expect(error).toHaveProperty('_tag', expectedTag)

    if (additionalChecks) {
      additionalChecks(error as E)
    }
  },

  /**
   * Assert that an error is a standard JavaScript Error
   */
  assertStandardError(error: unknown, expectedMessage?: string): asserts error is Error {
    expect(error).toBeInstanceOf(Error)

    if (expectedMessage) {
      expect((error as Error).message).toContain(expectedMessage)
    }
  },
}

export default TestErrorUtils
