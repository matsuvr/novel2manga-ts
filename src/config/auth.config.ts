export const authConfig = {
  // Authentication request timeout in milliseconds
  timeoutMs: 500,
  // Base path for NextAuth routes
  basePath: '/portal/api/auth',
} as const

export type AuthConfig = typeof authConfig
