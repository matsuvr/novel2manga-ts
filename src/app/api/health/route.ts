import { NextResponse } from 'next/server'

export async function GET() {
  try {
    return NextResponse.json({
      status: 'ok',
      uptime: process.uptime(),
      env: process.env.NODE_ENV ?? 'development',
    })
  } catch {
    // In case of unexpected error, still try to respond 500 with minimal payload
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}
