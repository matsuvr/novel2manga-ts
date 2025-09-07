import { getCloudflareContext } from '@opennextjs/cloudflare'
import { Context, Layer } from 'effect'
import { decode } from 'next-auth/jwt'

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
  const secret = getCloudflareContext().env.AUTH_SECRET

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
    // next-auth/jwt の decode は JWTDecodeParams で salt が必須型になっているバージョンに追随
    // salt 未指定時は secret を再利用（秘匿性を確保しつつ型要件を満たす）
    return await decode({ token, secret, salt: salt ?? secret })
  } catch (error) {
    console.error('Failed to decode or verify session token:', error)
    return null
  }
}
