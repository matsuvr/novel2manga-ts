#!/usr/bin/env tsx
import { getLogger } from '../src/infrastructure/logging/logger'
/**
 * Job Worker Startup Script
 * Starts the background job processing worker
 */
import { JobWorker } from '../src/workers/job-worker'

const logger = getLogger().withContext({ service: 'worker-startup' })

async function main() {
  try {
    logger.info('Starting job worker process...')

    // Create worker with environment-based configuration
    const worker = new JobWorker({
      tickIntervalMs: Number(process.env.WORKER_TICK_MS) || 5000,
      maxRetries: Number(process.env.WORKER_MAX_RETRIES) || 3,
      enableNotifications: process.env.WORKER_ENABLE_NOTIFICATIONS !== 'false',
      batchSize: Number(process.env.WORKER_BATCH_SIZE) || 1,
    })

    // Start the worker
    await worker.start()

    logger.info('Job worker started successfully')

    // Keep the process alive
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down worker...')
      await worker.stop()
      process.exit(0)
    })

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down worker...')
      await worker.stop()
      process.exit(0)
    })

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in worker process', {
        error: error.message,
        stack: error.stack,
      })
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in worker process', {
        reason: String(reason),
        promise: String(promise),
      })
      process.exit(1)
    })
  } catch (error) {
    logger.error('Failed to start job worker', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error starting worker:', error)
    process.exit(1)
  })
}

export { main as startWorker }
