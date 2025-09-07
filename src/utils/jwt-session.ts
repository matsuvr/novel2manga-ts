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
  salt: string | undefined = process.env.JWT_SALT ? jwtConfig.salt : undefined,
): Promise<SessionTokenPayload | null> {
  try {
    const params = salt
      ? { token, secret, salt }
      : ({ token, secret } as unknown as JWTDecodeParams)
    const decoded = await decode(params as JWTDecodeParams)
    return decoded as SessionTokenPayload | null
  } catch {
    return null
  }
}
