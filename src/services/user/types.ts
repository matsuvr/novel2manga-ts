/**
 * User service types and interfaces
 */

export interface UserSettings {
  emailNotifications: boolean
  theme: 'light' | 'dark'
  language: 'ja' | 'en' | 'zh-TW'
}

export class DatabaseError extends Error {
  readonly _tag = 'DatabaseError'
  constructor(
    readonly message: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DatabaseError'
  }
}

export class UserNotFoundError extends Error {
  readonly _tag = 'UserNotFoundError'
  constructor(readonly userId: string) {
    super(`User not found: ${userId}`)
    this.name = 'UserNotFoundError'
  }
}

export class ValidationError extends Error {
  readonly _tag = 'ValidationError'
  constructor(
    readonly message: string,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}
