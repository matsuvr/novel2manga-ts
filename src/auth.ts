import { DrizzleAdapter } from '@auth/drizzle-adapter'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { getDatabase } from '@/db'
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
  // DB初期化は必要時にのみ実行し、初回描画の遅延を避ける
  const configured = NextAuth({
    adapter: DrizzleAdapter(getDatabase()),
    basePath: '/portal/api/auth',
    // セッションはJWT方式を採用し、D1への永続化を回避する
    session: { strategy: 'jwt' },
    providers: [
      Google({ clientId: String(AUTH_GOOGLE_ID), clientSecret: String(AUTH_GOOGLE_SECRET) }),
    ],
    secret: String(AUTH_SECRET),
    callbacks: {
      async session({ session, token }) {
        // JWTのsub(=ユーザーID)をsession.user.idに反映
        if (session.user) {
          ;(session.user as { id?: string }).id =
            (token?.sub as string | undefined) || (session.user as { id?: string }).id
        }
        return session
      },
    },
  })

  const baseGET = configured.handlers.GET
  const basePOST = configured.handlers.POST
  const baseAuth = configured.auth
  const baseSignIn = configured.signIn
  const baseSignOut = configured.signOut

  return {
    GET: async (req: NextRequest) => {
      const url = req.nextUrl.pathname
      const { ms, value } = await measure(() => baseGET(req))
      const status = extractStatus(value)
      logAuthMetric('auth:GET', { ms, path: url, status })
      return value
    },
    POST: async (req: NextRequest) => {
      const url = req.nextUrl.pathname
      const { ms, value } = await measure(() => basePOST(req))
      const status = extractStatus(value)
      logAuthMetric('auth:POST', { ms, path: url, status })
      return value
    },
    auth: async () => {
      const { ms, value } = await measure(() => baseAuth())
      logAuthMetric('auth', { ms })
      return value
    },
    signIn: async (provider?: string) => {
      const { ms, value } = await measure(() => baseSignIn(provider))
      const status = extractStatus(value)
      logAuthMetric('auth:signIn', { ms, status })
      return value
    },
    signOut: async () => {
      const { ms, value } = await measure(() => baseSignOut())
      const status = extractStatus(value)
      logAuthMetric('auth:signOut', { ms, status })
      return value
    },
  }
}

const { GET, POST, auth, signIn, signOut } = createAuthModule()

export { GET, POST, auth, signIn, signOut }
