import { Effect } from 'effect'
import type { NextRequest } from 'next/server'
import { SECURITY_CONFIGS, withSecurityEffect } from '../../../lib/api-security'
import { VALIDATION_SCHEMAS } from '../../../lib/api-validation'
import { ApiError, requireAuth } from '../../../server/auth'
import {
  UserNotFoundError,
  UserService,
  UserServiceLive,
  ValidationError,
} from '../../../services/user'

/**
 * GET /api/me - Get current user information and settings
 */
export const GET = withSecurityEffect(SECURITY_CONFIGS.authenticated, (_request: NextRequest) =>
  Effect.gen(function* () {
    // Require authentication - will fail with AuthenticationError if not authenticated
    const user = yield* requireAuth
    const userService = yield* UserService

    // Get user settings
    const settings = yield* userService.getSettings(user.id)

    // Return user information with settings
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      settings,
      timestamp: new Date().toISOString(),
    }
  }).pipe(Effect.provide(UserServiceLive)),
)

/**
 * PATCH /api/me - Update user settings
 */
export const PATCH = withSecurityEffect(
  {
    ...SECURITY_CONFIGS.authenticated,
    validation: {
      body: {
        settings: { type: 'object', required: true },
      },
    },
  },
  (_request: NextRequest, validatedData?: { body?: unknown; query?: Record<string, unknown> }) =>
    Effect.gen(function* () {
      // Require authentication
      const user = yield* requireAuth
      const userService = yield* UserService

      // Extract validated settings from body
      const body = validatedData?.body as
        | { settings?: { emailNotifications?: boolean; theme?: string; language?: string } }
        | undefined
      const { settings = {} } = body ?? {}

      // Validate settings structure
      if (
        settings.emailNotifications !== undefined &&
        typeof settings.emailNotifications !== 'boolean'
      ) {
        return yield* Effect.fail(
          new ApiError(
            'VALIDATION_ERROR',
            'emailNotifications は boolean である必要があります',
            400,
          ),
        )
      }
      if (settings.theme !== undefined && !['light', 'dark'].includes(settings.theme)) {
        return yield* Effect.fail(
          new ApiError('VALIDATION_ERROR', 'theme は light または dark である必要があります', 400),
        )
      }
      if (settings.language !== undefined && !['ja', 'en', 'zh-TW'].includes(settings.language)) {
        return yield* Effect.fail(
          new ApiError(
            'VALIDATION_ERROR',
            'language は ja, en, または zh-TW である必要があります',
            400,
          ),
        )
      }

      // Update user settings
      // 型ナロー: 不正値は上のバリデーションで弾くため as キャストで narrow
      const narrowed = {
        emailNotifications: settings.emailNotifications,
        theme: settings.theme as 'light' | 'dark' | undefined,
        language: settings.language as 'ja' | 'en' | 'zh-TW' | undefined,
      }
      yield* userService.updateSettings(user.id, narrowed)

      return {
        success: true,
        message: '設定が更新されました',
        timestamp: new Date().toISOString(),
      }
    }).pipe(
      Effect.provide(UserServiceLive),
      Effect.mapError((error) =>
        error instanceof ValidationError
          ? new ApiError('VALIDATION_ERROR', error.message, 400, { field: error.field })
          : error instanceof UserNotFoundError
            ? new ApiError('NOT_FOUND', 'ユーザーが見つかりません', 404)
            : error instanceof ApiError
              ? error
              : new ApiError('SERVER_ERROR', 'サーバーエラーが発生しました', 500),
      ),
    ),
)

/**
 * DELETE /api/me - Delete user account
 */
export const DELETE = withSecurityEffect(
  {
    ...SECURITY_CONFIGS.sensitive,
    validation: {
      body: VALIDATION_SCHEMAS.ACCOUNT_DELETION,
    },
  },
  (_request: NextRequest, _validatedData?: { body?: unknown; query?: Record<string, unknown> }) =>
    Effect.gen(function* () {
      // Require authentication
      const user = yield* requireAuth
      const userService = yield* UserService

      // Confirmation is already validated by the schema
      // const body = _validatedData?.body as { confirm?: boolean } | undefined
      // const { confirm = false } = body ?? {}

      // Delete user account
      yield* userService.deleteAccount(user.id)

      return {
        success: true,
        message: 'アカウントが削除されました',
        timestamp: new Date().toISOString(),
      }
    }).pipe(
      Effect.provide(UserServiceLive),
      Effect.mapError((error) =>
        error instanceof UserNotFoundError
          ? new ApiError('NOT_FOUND', 'ユーザーが見つかりません', 404)
          : error instanceof ApiError
            ? error
            : new ApiError('SERVER_ERROR', 'サーバーエラーが発生しました', 500),
      ),
    ),
)
