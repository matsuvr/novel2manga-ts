import { decode, type JWTDecodeParams } from 'next-auth/jwt'
import { jwtConfig } from '@/config/jwt.config'

export interface SessionTokenPayload {
  sub?: string
  email?: string
  [key: string]: unknown
}

export function extractBearerToken(header: string | null): string | null {
  if (!header) return null
  const [scheme, value] = header.split(' ')
  return scheme === 'Bearer' && value ? value : null
}

export async function verifySessionToken(
  token: string,
  secret: string = String(process.env.AUTH_SECRET),
  salt: string = jwtConfig.salt,
): Promise<SessionTokenPayload | null> {
  try {
    // In next-auth v5, decode function parameters
    const params: JWTDecodeParams = {
      token,
      secret,
      salt,
    }
    const decoded = await decode(params)
    return decoded as SessionTokenPayload | null
  } catch {
    return null
  }
}
