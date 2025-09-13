/**
 * Worker Health Check API Endpoint
 * Provides health status information for the job worker system
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getWorkerStatistics, performHealthCheck } from '@/workers/health-check'

/**
 * GET /api/worker/health
 * Returns health status of the job worker system
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const includeStats = searchParams.get('stats') === 'true'

    // Perform health check
    const healthStatus = await performHealthCheck()

    // Include statistics if requested
    let statistics: Awaited<ReturnType<typeof getWorkerStatistics>> | undefined
    if (includeStats) {
      statistics = await getWorkerStatistics()
    }

    const response = {
      ...healthStatus,
      ...(statistics && { statistics }),
    }

    // Return appropriate HTTP status based on health
    const status = healthStatus.isHealthy ? 200 : 503

    return NextResponse.json(response, { status })
  } catch (error) {
    console.error('Health check API error:', error)

    return NextResponse.json(
      {
        isHealthy: false,
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

/**
 * POST /api/worker/health
 * Trigger a manual health check (for monitoring systems)
 */
export async function POST(_request: NextRequest): Promise<NextResponse> {
  try {
    // Perform comprehensive health check
    const healthStatus = await performHealthCheck()
    const statistics = await getWorkerStatistics()

    const response = {
      ...healthStatus,
      statistics,
      checkType: 'manual',
    }

    const status = healthStatus.isHealthy ? 200 : 503

    return NextResponse.json(response, { status })
  } catch (error) {
    console.error('Manual health check error:', error)

    return NextResponse.json(
      {
        isHealthy: false,
        timestamp: new Date().toISOString(),
        error: 'Manual health check failed',
        details: error instanceof Error ? error.message : String(error),
        checkType: 'manual',
      },
      { status: 500 },
    )
  }
}
