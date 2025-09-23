import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { Session, User } from 'next-auth'
import NextAuth from 'next-auth'
import type { JWT } from 'next-auth/jwt'
import GoogleProvider from 'next-auth/providers/google'
import { getDatabase } from '@/db'
import { getDatabaseServiceFactory } from '@/services/database'
import { getMissingAuthEnv } from '@/utils/auth-env'

// NextAuth.js v5 configuration
// Export the runtime helpers directly so imports receive callable functions.
export const { auth, handlers, signIn, signOut } = NextAuth({
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
  // --- Host Trust Configuration -------------------------------------------------
  // Auth.js v5 では、リクエスト Host ヘッダが既知/許可リストに含まれない場合
  // "UntrustedHost" エラーが throw され、今回のような
  //   [auth][error] UntrustedHost: Host must be trusted.
  // が頻発する。リバースプロキシ (例: nginx, CDN) 経由や複数ドメイン / Trailing slash
  // 差異がある構成では host 判定が失敗しやすいため、明示的に trustHost を有効化。
  // セキュリティ的には AUTH_URL(NEXTAUTH_URL) を厳密に 1 つ設定した上で true にする。
  // 必要に応じて、将来的に granular な allowlist 実装に切り替える余地を残す。
  trustHost: true,
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
