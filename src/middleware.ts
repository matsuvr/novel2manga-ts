import { type NextRequest, NextResponse } from 'next/server'

export function middleware(_request: NextRequest) {
  const response = NextResponse.next()

  // X-Frame-Options ヘッダを追加してクリックジャッキングを防止
  response.headers.set('X-Frame-Options', 'SAMEORIGIN')

  return response
}

// すべてのルートでミドルウェアを実行
export const config = {
  matcher: '/:path*',
}
