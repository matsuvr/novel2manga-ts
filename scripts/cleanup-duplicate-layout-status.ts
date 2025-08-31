#!/usr/bin/env tsx

/**
 * Data migration script to clean up duplicate layout_status records
 * before the unique constraint is fully enforced.
 *
 * This script should be run once before deploying the schema change
 * that enforces the unique constraint on (jobId, episodeNumber).
 */

import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { layoutStatus } from '@/db/schema'

// Simple console logger for migration script
const logger = {
  info: (message: string, data?: unknown) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data, null, 2) : '')
  },
  warn: (message: string, data?: unknown) => {
    console.log(`[WARN] ${message}`, data ? JSON.stringify(data, null, 2) : '')
  },
  error: (message: string, data?: unknown) => {
    console.error(`[ERROR] ${message}`, data ? JSON.stringify(data, null, 2) : '')
  },
}

// Create database connection directly without importing config
function createDatabase() {
  const sqlite = new Database('./database/novel2manga.db')
  return drizzle(sqlite)
}

async function cleanupDuplicateLayoutStatus() {
  const db = createDatabase()

  logger.info('Starting cleanup of duplicate layout_status records')

  try {
    // Find duplicate records (same jobId + episodeNumber combination)
    const duplicatesQuery = db
      .select({
        jobId: layoutStatus.jobId,
        episodeNumber: layoutStatus.episodeNumber,
        count: sql<number>`COUNT(*)`.as('count'),
      })
      .from(layoutStatus)
      .groupBy(layoutStatus.jobId, layoutStatus.episodeNumber)
      .having(sql`COUNT(*) > 1`)

    const duplicates = await duplicatesQuery

    if (duplicates.length === 0) {
      logger.info('No duplicate records found. Migration not needed.')
      return
    }

    logger.warn('Found duplicate layout_status records', {
      duplicateCount: duplicates.length,
      duplicates: duplicates.map((d) => ({
        jobId: d.jobId,
        episodeNumber: d.episodeNumber,
        count: d.count,
      })),
    })

    let totalDeleted = 0

    // For each duplicate group, keep the most recent record and delete others
    for (const duplicate of duplicates) {
      const records = await db
        .select()
        .from(layoutStatus)
        .where(
          sql`${layoutStatus.jobId} = ${duplicate.jobId} AND ${layoutStatus.episodeNumber} = ${duplicate.episodeNumber}`,
        )
        .orderBy(sql`${layoutStatus.createdAt} DESC`)

      // Keep the first (most recent) record, delete the rest
      const recordsToDelete = records.slice(1)

      for (const record of recordsToDelete) {
        await db
          .delete(layoutStatus)
          .where(
            sql`${layoutStatus.jobId} = ${record.jobId} AND ${layoutStatus.episodeNumber} = ${record.episodeNumber} AND ${layoutStatus.createdAt} = ${record.createdAt}`,
          )
        totalDeleted++

        logger.info('Deleted duplicate record', {
          jobId: record.jobId,
          episodeNumber: record.episodeNumber,
          createdAt: record.createdAt,
        })
      }
    }

    logger.info('Cleanup completed successfully', {
      duplicateGroupsProcessed: duplicates.length,
      totalRecordsDeleted: totalDeleted,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error('Cleanup failed', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Run the cleanup if this script is executed directly
cleanupDuplicateLayoutStatus()
  .then(() => {
    logger.info('Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    logger.error('Migration script failed', { error: String(error) })
    process.exit(1)
  })

export { cleanupDuplicateLayoutStatus }
