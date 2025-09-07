export const authConfig = {
  // Authentication request timeout in milliseconds
  timeoutMs: 500,
} as const

export type AuthConfig = typeof authConfig
