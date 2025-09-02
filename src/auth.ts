import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDatabase } from '@/db'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getMissingAuthEnv } from '@/utils/auth-env'
import { logAuthMetric, measure } from '@/utils/auth-metrics'

const db = getDatabase()

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

// ここでエクスポートを宣言し、下で環境に応じて代入する
let GET: (req: NextRequest) => Promise<Response> | Response
let POST: (req: NextRequest) => Promise<Response> | Response
let auth: () => Promise<import('next-auth').Session | null>
let signIn: (provider?: string) => Promise<Response> | Response
let signOut: () => Promise<Response> | Response

if (missing.length > 0) {
  const message =
    `Authentication is not configured. Missing environment variables: ${missing.join(', ')}`

  const errorBody = {
    error: 'Missing authentication environment variables',
    missing,
    howToFix:
      'Set AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, and AUTH_SECRET in .env/.env.local. See .env.example for details.',
  } as const

  // 認証ルートは明示的に503を返し、処理を停止する
  const handler = () => NextResponse.json(errorBody, { status: 503 })
  GET = handler
  POST = handler

  // 直接呼び出し時はエラーで明示停止（フォールバック禁止方針に準拠）
  auth = async () => {
    throw new Error(message)
  }
  signIn = () => NextResponse.json(errorBody, { status: 503 })
  signOut = () => NextResponse.json(errorBody, { status: 503 })
} else {
  const { AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET } = process.env
  const configured = NextAuth({
    adapter: DrizzleAdapter(db),
    // DBアクセスを抑制するため、セッションはJWT方式へ切替
    session: { strategy: 'jwt' },
    providers: [
      Google({ clientId: String(AUTH_GOOGLE_ID), clientSecret: String(AUTH_GOOGLE_SECRET) }),
    ],
    secret: String(AUTH_SECRET),
  })

  const baseGET = configured.handlers.GET
  const basePOST = configured.handlers.POST
  const baseAuth = configured.auth
  const baseSignIn = configured.signIn
  const baseSignOut = configured.signOut

  GET = async (req: NextRequest) => {
    const url = (() => {
      try {
        return req.nextUrl?.pathname ?? new URL(req.url).pathname
      } catch {
        return undefined
      }
    })()
    const { ms, value } = await measure(() => baseGET(req))
    const status = extractStatus(value)
    logAuthMetric('auth:GET', { ms, path: url, status })
    return value
  }

  POST = async (req: NextRequest) => {
    const url = (() => {
      try {
        return req.nextUrl?.pathname ?? new URL(req.url).pathname
      } catch {
        return undefined
      }
    })()
    const { ms, value } = await measure(() => basePOST(req))
    const status = extractStatus(value)
    logAuthMetric('auth:POST', { ms, path: url, status })
    return value
  }

  auth = async () => {
    const { ms, value } = await measure(() => baseAuth())
    logAuthMetric('auth', { ms })
    return value
  }

  signIn = async (provider?: string) => {
    const { ms, value } = await measure(() => baseSignIn(provider))
    const status = extractStatus(value)
    logAuthMetric('auth:signIn', { ms, status })
    return value
  }

  signOut = async () => {
    const { ms, value } = await measure(() => baseSignOut())
    const status = extractStatus(value)
    logAuthMetric('auth:signOut', { ms, status })
    return value
  }
}

export { GET, POST, auth, signIn, signOut }
