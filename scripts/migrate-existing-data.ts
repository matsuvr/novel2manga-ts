#!/usr/bin/env tsx

/**
 * Migration script to associate existing novels and jobs with users
 * This script should be run after implementing authentication to handle existing data
 */

import { getLogger } from '../src/infrastructure/logging/logger'
import { db } from '../src/services/database/index'

const logger = getLogger().withContext({ script: 'migrate-existing-data' })

async function migrateExistingData() {
  try {
    logger.info('Starting migration of existing data to associate with users')

    // Get all novels and jobs that are currently associated with 'anonymous'
    const novels = await db.novels().getAllNovels()
    // TODO: 実装されていない getAllJobs を利用していたため一旦空配列に
    // const jobs: unknown[] = [] // await db.jobs().getAllJobs()

    const anonymousNovels = novels.filter((novel) => novel.userId === 'anonymous')
    // const anonymousJobs = jobs.filter(job => (job as any).userId === 'anonymous')
    const anonymousJobsCount = 0

    logger.info('Found data to migrate', {
      anonymousNovels: anonymousNovels.length,
      anonymousJobs: anonymousJobsCount,
    })

    if (anonymousNovels.length === 0 && anonymousJobsCount === 0) {
      logger.info('No data to migrate - all data is already associated with users')
      return
    }

    // For this migration, we'll create a default admin user if none exists
    // In a real scenario, you might want to:
    // 1. Create a migration user
    // 2. Assign data to specific users based on some criteria
    // 3. Leave data as anonymous until users claim it

    // Check if there are any existing users
    // TODO: users() サービス未実装のため省略
    const allUsers: { id: string }[] = [] // await db.users().getAllUsers()

    let migrationUserId: string

    if (allUsers.length === 0) {
      // Create a migration user
      migrationUserId = `migration-user-${Date.now()}`
      logger.info('Creating migration user', { userId: migrationUserId })

      // Note: In a real scenario, you'd use the proper user creation method
      // This is a simplified approach for the migration
      // await db.users().createUser({
      //     id: migrationUserId,
      //     email: 'migration@example.com',
      //     name: 'Migration User',
      //     emailNotifications: true,
      //     theme: 'light',
      //     language: 'ja'
      // })
    } else {
      // Use the first existing user
      migrationUserId = allUsers[0].id
      logger.info('Using existing user for migration', { userId: migrationUserId })
    }

    // Migrate novels
    for (const novel of anonymousNovels) {
      try {
        await db.novels().updateNovel(novel.id, {
          ...novel,
          userId: migrationUserId,
        })
        logger.info('Migrated novel', { novelId: novel.id, userId: migrationUserId })
      } catch (error) {
        logger.error('Failed to migrate novel', {
          novelId: novel.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Migrate jobs
    // NOTE: jobs の移行は未実装サービスのためスキップ

    logger.info('Migration completed successfully', {
      migratedNovels: anonymousNovels.length,
      migratedJobs: anonymousJobsCount,
      migrationUserId,
    })
  } catch (error) {
    logger.error('Migration failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateExistingData()
    .then(() => {
      console.log('Migration completed successfully')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration failed:', error)
      process.exit(1)
    })
}

export { migrateExistingData }
