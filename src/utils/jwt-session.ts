import { Context, Layer } from 'effect'
import { decode, type JWT } from 'next-auth/jwt'

export interface SessionTokenPayload {
  sub?: string
  email?: string
  [key: string]: unknown
}

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = header.trim().match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

// Effect v3: string サービスのタグは GenericTag を使用（Tag API の互換差異回避）
export const AuthSecret = Context.GenericTag<string>('AuthSecret')

export const AuthSecretLive = Layer.sync(AuthSecret, () => {
  const secret = process.env.AUTH_SECRET

  if (!secret) {
    throw new Error('AUTH_SECRET environment variable not provided.')
  }
  return secret
})

export async function verifySessionToken(
  token: string,
  secret: string | undefined,
  salt?: string,
): Promise<SessionTokenPayload | null> {
  if (!secret) {
    console.error('AUTH_SECRET environment variable not provided. Cannot verify session token.')
    return null
  }
  try {
    // NextAuth v4のjwt.decode関数を使用
    // next-auth's decode expects a required salt in its type; construct
    // the params object conditionally and cast to satisfy the typings.
    const decodeParams: Partial<Parameters<typeof decode>[0]> = { token, secret }
    if (typeof salt === 'string') decodeParams.salt = salt

    const jwt: JWT | null = await decode(decodeParams as Parameters<typeof decode>[0])

    // JWT型をSessionTokenPayload型に変換して返す
    if (!jwt) return null

    // 明示的に SessionTokenPayload 型のオブジェクトを作成して返す
    const payload: SessionTokenPayload = {
      ...jwt,
      sub: jwt.sub,
      // v4 の JWT.email は string | null | undefined の可能性があるため
      // null を undefined に正規化する（SessionTokenPayload の email は string | undefined）
      email: (jwt.email ?? undefined) as string | undefined,
    }

    return payload
  } catch (error) {
    console.error('Failed to decode or verify session token:', error)
    return null
  }
}
