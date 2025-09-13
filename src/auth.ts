import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { NextResponse } from 'next/server'
import type { NextAuthOptions, Session } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getDatabase } from '@/db'
import { getDatabaseServiceFactory } from '@/services/database'
import { authConfig } from '@/config/auth.config'
import { getMissingAuthEnv } from '@/utils/auth-env'
import { logAuthMetric, measure } from '@/utils/auth-metrics'

// Response の有無に依存せず、安全に status を取得するための型ガード
type HasStatus = Pick<Response, 'status'>
function hasStatus(input: unknown): input is HasStatus {
  if (typeof input !== 'object' || input === null) return false
  const rec = input as Record<string, unknown>
  return typeof rec.status === 'number'
}

// Helper to get the configured NEXTAUTH base URL.
// Returns a trimmed absolute base URL (no trailing slash) when NEXTAUTH_URL is set,
// otherwise returns undefined to indicate callers should use relative routes.
function getNextAuthBaseUrl(): string | undefined {
  const raw = process.env.NEXTAUTH_URL
  if (!raw) return undefined
  return raw.replace(/\/$/, '')
}
function extractStatus(input: unknown): number | undefined {
  return hasStatus(input) ? input.status : undefined
}

// Return an error response when authentication env vars are missing
function respondIfMissingAuthEnv(message: string): NextResponse | undefined {
  const missing = getMissingAuthEnv()
  if (missing.length > 0) {
    return NextResponse.json({ error: message, missing }, { status: 503 })
  }
  return undefined
}

// Removed App Router direct GET/POST handlers.

export const auth = async (): Promise<Session | null | undefined> => {
  const missing = getMissingAuthEnv()
  if (missing.length > 0) throw new Error('Authentication is not configured')
  const { ms, value } = await measure(async () => null)
  logAuthMetric('auth', { ms })
  return value
}

export const signIn = async (provider?: string) => {
  const missingResponse = respondIfMissingAuthEnv('Missing auth env')
  if (missingResponse) return missingResponse
  const base = getNextAuthBaseUrl()
  const target = `${base ?? ''}${authConfig.basePath}/signin${
    provider ? `?provider=${provider}` : ''
  }`
  const { ms, value } = await measure(() => {
    return NextResponse.redirect(target)
  })
  const status = extractStatus(value)
  logAuthMetric('auth:signIn', { ms, status })
  return value
}

export const signOut = async () => {
  const missingResponse = respondIfMissingAuthEnv('Missing auth env')
  if (missingResponse) return missingResponse
  const base = getNextAuthBaseUrl()
  const target = `${base ?? ''}${authConfig.basePath}/signout`
  const { ms, value } = await measure(() => NextResponse.redirect(target))
  const status = extractStatus(value)
  logAuthMetric('auth:signOut', { ms, status })
  return value
}

// Handlers are exported directly above; no runtime factory call at module import.

// v4用のauthOptionsもexport
// Export a lazy getter for authOptions to avoid DB access at module import
export const getAuthOptions = (): NextAuthOptions => {
  void getDatabase() // ensure DatabaseServiceFactory initialized
  return {
    adapter: DrizzleAdapter(
      getDatabaseServiceFactory().getRawDatabase() as Parameters<typeof DrizzleAdapter>[0],
    ),
    session: { strategy: 'jwt' },
    debug: process.env.NODE_ENV === 'development',
    secret: String(process.env.AUTH_SECRET),
    providers: [
      GoogleProvider({
        clientId: String(process.env.AUTH_GOOGLE_ID),
        clientSecret: String(process.env.AUTH_GOOGLE_SECRET),
        authorization: {
          params: {
            prompt: 'consent',
            access_type: 'offline',
            response_type: 'code',
          },
        },
      }),
    ],
    pages: {
      signIn: '/portal/auth/signin',
      error: '/portal/auth/error',
    },
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.userId = user.id
        }
        return token
      },
      async session({ session, token }) {
        if (session.user && token.userId) {
          session.user.id = token.userId as string
        }
        return session
      },
    },
  }
}
