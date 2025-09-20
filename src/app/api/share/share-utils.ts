import type { NextRequest } from 'next/server'

export function resolveBaseUrl(request: NextRequest): string {
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }
  const url = new URL(request.url)
  return `${url.protocol}//${url.host}`
}
