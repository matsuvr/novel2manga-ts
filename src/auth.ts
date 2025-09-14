import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { Session, User } from 'next-auth'
import NextAuth from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import GoogleProvider from 'next-auth/providers/google'
import { getDatabase } from '@/db'
import { getDatabaseServiceFactory } from '@/services/database'
import { getMissingAuthEnv } from '@/utils/auth-env'

// NextAuth.js v5 configuration
// Initialize NextAuth and re-export the `auth` helper so server-side
// code (e.g. `requireAuth`) can call `auth()` to obtain the current session.
export const {
  auth: nextAuth,
  handlers,
  signIn: nextSignIn,
  signOut: nextSignOut,
} = NextAuth({
  // basePath: '/portal/api/auth', // Remove custom basePath to use default
  adapter: DrizzleAdapter(
    (() => {
      // Ensure database is initialized before creating adapter
      getDatabase()
      return getDatabaseServiceFactory().getRawDatabase() as Parameters<typeof DrizzleAdapter>[0]
    })(),
  ),
  session: { strategy: 'jwt' },
  debug: process.env.NODE_ENV === 'development',
  secret: String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET),
  providers: [
    GoogleProvider({
      clientId: String(process.env.AUTH_GOOGLE_ID),
      clientSecret: String(process.env.AUTH_GOOGLE_SECRET),
    }),
  ],
  pages: {
    signIn: '/portal/auth/signin',
    error: '/portal/auth/error',
  },
  callbacks: {
    async jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.userId = user.id
      }
      return token
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string
      }
      return session
    },
  },
})

// Re-export the runtime `auth` function under the expected name.
// Some modules (and tests) import `auth` from '@/auth' and expect it to be
// a callable function that returns the current session. By exporting the
// `nextAuth` value as `auth` we preserve that contract.
export const auth = nextAuth

// Validate required environment variables at module initialization time
// to fail early if NextAuth is not configured. This mirrors the check in
// the app route that mounts NextAuth handlers.
const missing = getMissingAuthEnv()
if (missing.length > 0) {
  // Throwing here will prevent the app from starting with an insecure config
  throw new Error(`Authentication is not configured: missing ${missing.join(', ')}`)
}

// v4互換性のための関数（非推奨）
export const getAuthOptions = () => {
  throw new Error(
    'getAuthOptions is deprecated in NextAuth.js v5. Use the exported auth, handlers, signIn, signOut directly.',
  )
}

// Provide a signIn alias for compatibility with modules/tests that import `signIn` from '@/auth'
export const signIn = nextSignIn
// Provide a signOut alias for compatibility with modules/tests that import `signOut` from '@/auth'
export const signOut = nextSignOut
