/**
 * User Service Interface and Implementation using Effect TS
 */

import { eq } from 'drizzle-orm'
import { Context, Effect, Layer } from 'effect'
import { getDatabase } from '@/db'
import { users } from '@/db/schema'
import { DatabaseError, UserNotFoundError, type UserSettings, ValidationError } from './types'

/**
 * User Service Interface
 */
export interface UserService {
  readonly getSettings: (
    userId: string,
  ) => Effect.Effect<UserSettings, DatabaseError | UserNotFoundError>
  readonly updateSettings: (
    userId: string,
    settings: Partial<UserSettings>,
  ) => Effect.Effect<void, DatabaseError | UserNotFoundError | ValidationError>
  readonly deleteAccount: (userId: string) => Effect.Effect<void, DatabaseError | UserNotFoundError>
}

/**
 * User Service Context Tag
 */
export const UserService = Context.GenericTag<UserService>('UserService')

/**
 * Validation helpers
 */
const validateTheme = (theme: unknown): theme is 'light' | 'dark' => {
  return theme === 'light' || theme === 'dark'
}

const validateLanguage = (language: unknown): language is 'ja' | 'en' | 'zh-TW' => {
  return language === 'ja' || language === 'en' || language === 'zh-TW'
}

const validateEmailNotifications = (value: unknown): value is boolean => {
  return typeof value === 'boolean'
}

/**
 * User Service Live Implementation
 */
export const UserServiceLive = Layer.succeed(UserService, {
  getSettings: (userId: string) =>
    Effect.tryPromise({
      try: async () => {
        const db = getDatabase()
        const rows = await db.select().from(users).where(eq(users.id, userId))
        const userRecord = Array.isArray(rows) ? rows[0] : undefined

        if (!userRecord) {
          throw new UserNotFoundError(userId)
        }

        return {
          emailNotifications: Boolean(userRecord.emailNotifications),
          theme: (userRecord.theme as 'light' | 'dark') ?? 'light',
          language: (userRecord.language as 'ja' | 'en' | 'zh-TW') ?? 'ja',
        }
      },
      catch: (error) => {
        if (error instanceof UserNotFoundError) {
          return error
        }
        return new DatabaseError(`Failed to get user settings: ${String(error)}`, error)
      },
    }),

  updateSettings: (userId: string, settings: Partial<UserSettings>) =>
    Effect.gen(function* () {
      // Validate input settings
      if (settings.theme !== undefined && !validateTheme(settings.theme)) {
        return yield* Effect.fail(new ValidationError('Invalid theme value', 'theme'))
      }

      if (settings.language !== undefined && !validateLanguage(settings.language)) {
        return yield* Effect.fail(new ValidationError('Invalid language value', 'language'))
      }

      if (
        settings.emailNotifications !== undefined &&
        !validateEmailNotifications(settings.emailNotifications)
      ) {
        return yield* Effect.fail(
          new ValidationError('Invalid emailNotifications value', 'emailNotifications'),
        )
      }

      // Update database
      yield* Effect.tryPromise({
        try: async () => {
          const db = getDatabase()

          // Check if user exists first
          const [existingUser] = await db.select().from(users).where(eq(users.id, userId))
          if (!existingUser) {
            throw new UserNotFoundError(userId)
          }

          // Prepare update data
          const updateData: Record<string, string | number | boolean> = {}
          if (settings.emailNotifications !== undefined) {
            updateData.emailNotifications = settings.emailNotifications ? 1 : 0
          }
          if (settings.theme !== undefined) {
            updateData.theme = settings.theme
          }
          if (settings.language !== undefined) {
            updateData.language = settings.language
          }

          // Only update if there's something to update
          if (Object.keys(updateData).length > 0) {
            await db.update(users).set(updateData).where(eq(users.id, userId))
          }
        },
        catch: (error) => {
          if (error instanceof UserNotFoundError) {
            return error
          }
          return new DatabaseError(`Failed to update user settings: ${String(error)}`, error)
        },
      })
    }),

  deleteAccount: (userId: string) =>
    Effect.tryPromise({
      try: async () => {
        const db = getDatabase()

        // Check if user exists first
        const [existingUser] = await db.select().from(users).where(eq(users.id, userId))
        if (!existingUser) {
          throw new UserNotFoundError(userId)
        }

        // Delete user (CASCADE will handle related data due to foreign key constraints)
        await db.delete(users).where(eq(users.id, userId))

        // Note: File cleanup should be handled by a separate background job
        // as it involves external storage operations that may fail
      },
      catch: (error) => {
        if (error instanceof UserNotFoundError) {
          return error
        }
        return new DatabaseError(`Failed to delete user account: ${String(error)}`, error)
      },
    }),
})
