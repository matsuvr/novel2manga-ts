import type { NextRequest } from 'next/server'
import { getHealthStatus } from '@/services/application/health-check'
import { createErrorResponse, createSuccessResponse } from '@/utils/api-error'

export async function GET(_req: NextRequest) {
  try {
    const health = await getHealthStatus()
    const httpStatus = health.status === 'ok' ? 200 : 503
    return createSuccessResponse(health, httpStatus)
  } catch (error) {
    return createErrorResponse(error, 'Health check failed')
  }
}

// NOTE: POST/other methods reserved for future self-diagnostic triggers.
