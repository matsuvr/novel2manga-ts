import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { getDatabaseServiceFactory } from '@/services/database'
import { getMissingAuthEnv } from '@/utils/auth-env'
import { logAuthMetric, measure } from '@/utils/auth-metrics'

const missing = getMissingAuthEnv()

// Response の有無に依存せず、安全に status を取得するための型ガード
type HasStatus = Pick<Response, 'status'>
function hasStatus(input: unknown): input is HasStatus {
  if (typeof input !== 'object' || input === null) return false
  const rec = input as Record<string, unknown>
  return typeof rec.status === 'number'
}
function extractStatus(input: unknown): number | undefined {
  return hasStatus(input) ? input.status : undefined
}

type Handlers = {
  GET: (req: NextRequest) => Promise<Response> | Response
  POST: (req: NextRequest) => Promise<Response> | Response
  auth: () => Promise<import('next-auth').Session | null>
  signIn: (provider?: string) => Promise<Response> | Response
  signOut: () => Promise<Response> | Response
}

function createAuthModule(): Handlers {
  if (missing.length > 0) {
    const message = `Authentication is not configured. Missing environment variables: ${missing.join(', ')}`

    const errorBody = {
      error: 'Missing authentication environment variables',
      missing,
      howToFix:
        'Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET in .env/.env.local. See .env.example for details.',
    } as const

    // 認証ルートは明示的に503を返し、処理を停止する
    const handler = () => NextResponse.json(errorBody, { status: 503 })

    return {
      GET: handler,
      POST: handler,
      // 直接呼び出し時はエラーで明示停止（フォールバック禁止方針に準拠）
      auth: async () => {
        throw new Error(message)
      },
      signIn: () => NextResponse.json(errorBody, { status: 503 }),
      signOut: () => NextResponse.json(errorBody, { status: 503 }),
    }
  }

  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET } = process.env

  // NextAuth v4の設定
  const authOptions: NextAuthOptions = {
    adapter: DrizzleAdapter(
      getDatabaseServiceFactory().getRawDatabase() as Parameters<typeof DrizzleAdapter>[0],
    ),
    // v4ではbasePathが使用可能 (削除済み)
    session: { strategy: 'jwt' },
    debug: process.env.NODE_ENV === 'development',
    secret: String(AUTH_SECRET),
    providers: [
      GoogleProvider({
        clientId: String(AUTH_GOOGLE_ID),
        clientSecret: String(AUTH_GOOGLE_SECRET),
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
        // ユーザー情報が利用可能な場合（初回ログイン時）、トークンにユーザーIDを保存
        if (user) {
          token.userId = user.id
        }
        return token
      },
      async session({ session, token }) {
        // JWTのuserIdをsession.user.idに反映
        if (session.user && token.userId) {
          ; (session.user as { id?: string }).id = token.userId as string
        }
        return session
      },
    },
  }

  // NextAuth v4のハンドラー作成
  const configured = NextAuth(authOptions)

  return {
    GET: async (req: NextRequest) => {
      const url = req.nextUrl.pathname
      const fullUrl = req.url
      const searchParams = req.nextUrl.searchParams
      console.log('NextAuth GET Request:', {
        pathname: url,
        fullUrl,
        searchParams: Object.fromEntries(searchParams.entries()),
        method: req.method
      })
      const { ms, value } = await measure(() => configured(req, new NextResponse()))
      const status = extractStatus(value)
      logAuthMetric('auth:GET', { ms, path: url, status })
      return value
    },
    POST: async (req: NextRequest) => {
      const url = req.nextUrl.pathname
      const fullUrl = req.url
      const searchParams = req.nextUrl.searchParams
      console.log('NextAuth POST Request:', {
        pathname: url,
        fullUrl,
        searchParams: Object.fromEntries(searchParams.entries()),
        method: req.method
      })
      const { ms, value } = await measure(() => configured(req, new NextResponse()))
      const status = extractStatus(value)
      logAuthMetric('auth:POST', { ms, path: url, status })
      return value
    },
    auth: async () => {
      // v4では getServerSession を使用する必要がありますが、
      // ここでは既存のAPIとの互換性を保つため簡略化
      const { ms, value } = await measure(async () => {
        // 実際の実装では getServerSession(authOptions) を使用
        return null
      })
      logAuthMetric('auth', { ms })
      return value
    },
    signIn: async (provider?: string) => {
      const { ms, value } = await measure(() => {
        // v4でのサインイン処理
        return NextResponse.redirect(`/portal/api/auth/signin${provider ? `?provider=${provider}` : ''}`)
      })
      const status = extractStatus(value)
      logAuthMetric('auth:signIn', { ms, status })
      return value
    },
    signOut: async () => {
      const { ms, value } = await measure(() => {
        // v4でのサインアウト処理
        return NextResponse.redirect('/portal/api/auth/signout')
      })
      const status = extractStatus(value)
      logAuthMetric('auth:signOut', { ms, status })
      return value
    },
  }
}

const { GET, POST, auth, signIn, signOut } = createAuthModule()

export { GET, POST, auth, signIn, signOut }

// v4用のauthOptionsもexport
export const authOptions: NextAuthOptions = {
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
        ; (session.user as { id?: string }).id = token.userId as string
      }
      return session
    },
  },
}