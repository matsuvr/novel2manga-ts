import { decode, type JWTDecodeParams } from 'next-auth/jwt'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { Context, Layer } from 'effect'
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

export const AuthSecret = Context.Tag<string>('AuthSecret')

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
  salt: string = jwtConfig.salt,
): Promise<SessionTokenPayload | null> {
  if (!secret) {
    console.error('AUTH_SECRET environment variable not provided. Cannot verify session token.')
    return null
  }
  try {
    // In next-auth v5, decode function parameters
    const params: JWTDecodeParams = {
      token,
      secret,
      salt,
    }
    const decoded = await decode(params)
    return decoded as SessionTokenPayload | null
  } catch (error) {
    console.error('Failed to decode or verify session token:', error)
    return null
  }
}
