import { routesConfig } from './routes.config'

export const authConfig = {
  // Authentication request timeout in milliseconds
  timeoutMs: 500,
  // Base path for NextAuth routes
  basePath: '/portal/api/auth',
  // Default URL to redirect after authentication
  defaultCallbackUrl: routesConfig.home,
} as const

export type AuthConfig = typeof authConfig
