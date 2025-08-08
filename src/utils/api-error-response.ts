import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { HttpError } from './http-errors'

type Env = 'development' | 'test' | 'production'

const env = (process.env.NODE_ENV as Env) ?? 'development'

export function toErrorResponse(error: unknown, fallbackMessage = 'Internal Server Error') {
  // Zod validation
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request data', details: error.errors },
      { status: 400 },
    )
  }

  // Expected HTTP errors
  if (error instanceof HttpError) {
    const body: Record<string, unknown> = { error: error.message }
    if (env !== 'production') {
      body.code = error.code
      body.details = error.details
    }
    return NextResponse.json(body, { status: error.status })
  }

  // Unknown errors → 500
  const details = error instanceof Error ? error.message : String(error)
  if (env !== 'production') {
    console.error('[api] Unhandled error:', error)
    return NextResponse.json({ error: fallbackMessage, details }, { status: 500 })
  }
  return NextResponse.json({ error: fallbackMessage }, { status: 500 })
}

export function assertParam(condition: unknown, message: string) {
  if (!condition) {
    throw new HttpError(message, 400)
  }
}
