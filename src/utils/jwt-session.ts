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
    const jwt: JWT | null = await decode({
      token,
      secret,
      // v4では salt パラメータがオプショナル
      ...(salt && { salt })
    })

    // JWT型をSessionTokenPayload型に変換して返す
    if (!jwt) return null

    return {
      sub: jwt.sub,
      email: jwt.email || undefined, // v4のJWT.emailはstring | undefinedなのでnull除去
      ...jwt, // その他のプロパティも展開
    } as SessionTokenPayload
  } catch (error) {
    console.error('Failed to decode or verify session token:', error)
    return null
  }
}