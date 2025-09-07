import { decode, type JWTDecodeParams } from 'next-auth/jwt'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { Context, Layer } from 'effect'
// cloudflare-env.d.ts declares a global interface CloudflareEnv; we just reference its name.
import { jwtConfig } from '@/config/jwt.config'

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

export const AuthSecret = Context.GenericTag<string>('AuthSecret')

export const AuthSecretLive = Layer.sync(AuthSecret, () => {
  const { AUTH_SECRET: secret } = getCloudflareContext().env as CloudflareEnv
  if (!secret) {
    throw new Error('AUTH_SECRET environment variable not provided.')
  }
  return secret
})

export async function verifySessionToken(
  token: string,
  secret: string = String(process.env.AUTH_SECRET),
  salt: string | undefined = process.env.JWT_SALT ? jwtConfig.salt : undefined,

): Promise<SessionTokenPayload | null> {
  if (!secret) {
    console.error('AUTH_SECRET environment variable not provided. Cannot verify session token.')
    return null
  }
  try {
    const params = salt
      ? { token, secret, salt }
      : ({ token, secret } as unknown as JWTDecodeParams)
    const decoded = await decode(params as JWTDecodeParams)
    return decoded as SessionTokenPayload | null
  } catch (error) {
    console.error('Failed to decode or verify session token:', error)
    return null
  }
}
