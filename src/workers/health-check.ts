/**
 * Worker Health Check Utilities
 * Provides health check functionality for the job worker
 */
import { eq, sql } from 'drizzle-orm'
import { getDatabase } from '@/db'
import { jobs } from '@/db/schema'

export interface WorkerHealthStatus {
  isHealthy: boolean
  timestamp: string
  checks: {
    database: boolean
    pendingJobs: number
    processingJobs: number
    failedJobs: number
    lastProcessedJob?: string
  }
  errors?: string[]
}

/**
 * Perform health check for the worker system
 */
export async function performHealthCheck(): Promise<WorkerHealthStatus> {
  const timestamp = new Date().toISOString()
  const errors: string[] = []
  let isHealthy = true

  const checks = {
    database: false,
    pendingJobs: 0,
    processingJobs: 0,
    failedJobs: 0,
    lastProcessedJob: undefined as string | undefined,
  }

  try {
    // Check database connectivity
    const db = getDatabase()

    // Test database connection with a simple query
    await db.select({ count: sql<number>`count(*)` }).from(jobs)
    checks.database = true

    // Get job statistics
    const [pendingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, 'pending'))

    const [processingCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, 'processing'))

    const [failedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, 'failed'))

    checks.pendingJobs = pendingCount?.count || 0
    checks.processingJobs = processingCount?.count || 0
    checks.failedJobs = failedCount?.count || 0

    // Get last processed job
    const [lastJob] = await db
      .select({ id: jobs.id, completedAt: jobs.completedAt })
      .from(jobs)
      .where(eq(jobs.status, 'completed'))
      .orderBy(sql`${jobs.completedAt} DESC`)
      .limit(1)

    if (lastJob?.completedAt) {
      checks.lastProcessedJob = lastJob.completedAt
    }

    // Health check criteria
    if (checks.processingJobs > 10) {
      errors.push('Too many jobs stuck in processing state')
      isHealthy = false
    }

    if (checks.failedJobs > 50) {
      errors.push('High number of failed jobs detected')
      isHealthy = false
    }
  } catch (error) {
    errors.push(
      `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    isHealthy = false
  }

  return {
    isHealthy,
    timestamp,
    checks,
    ...(errors.length > 0 && { errors }),
  }
}

/**
 * Get worker statistics for monitoring
 */
export async function getWorkerStatistics(): Promise<{
  totalJobs: number
  completedJobs: number
  failedJobs: number
  pendingJobs: number
  processingJobs: number
  averageProcessingTime?: number
}> {
  const db = getDatabase()

  // Get job counts by status
  const statusCounts = await db
    .select({
      status: jobs.status,
      count: sql<number>`count(*)`,
    })
    .from(jobs)
    .groupBy(jobs.status)

  const stats = {
    totalJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    pendingJobs: 0,
    processingJobs: 0,
  }

  for (const row of statusCounts) {
    const count = row.count || 0
    stats.totalJobs += count

    switch (row.status) {
      case 'completed':
        stats.completedJobs = count
        break
      case 'failed':
        stats.failedJobs = count
        break
      case 'pending':
        stats.pendingJobs = count
        break
      case 'processing':
        stats.processingJobs = count
        break
    }
  }

  // Calculate average processing time for completed jobs
  try {
    const [avgTime] = await db
      .select({
        avgDuration: sql<number>`AVG(
                    CASE 
                        WHEN ${jobs.startedAt} IS NOT NULL AND ${jobs.completedAt} IS NOT NULL 
                        THEN (julianday(${jobs.completedAt}) - julianday(${jobs.startedAt})) * 86400
                        ELSE NULL 
                    END
                )`,
      })
      .from(jobs)
      .where(eq(jobs.status, 'completed'))

    if (avgTime?.avgDuration) {
      return {
        ...stats,
        averageProcessingTime: Math.round(avgTime.avgDuration),
      }
    }
  } catch (_error) {
    // Ignore errors in average calculation
  }

  return stats
}
