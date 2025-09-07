import { decode } from 'next-auth/jwt'

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
): Promise<SessionTokenPayload | null> {
  try {
    return await decode({ token, secret })
  } catch {
    return null
  }
}
