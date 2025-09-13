#!/usr/bin/env node
/**
 * Job Worker Startup Script (JavaScript version)
 * Starts the background job processing worker
 */

// Use dynamic import for ES modules
async function startWorker() {
  try {
    console.log('Starting job worker process...')

    // Import the worker module
    const { JobWorker } = await import('../src/workers/job-worker.js')
    const { getLogger } = await import('../src/infrastructure/logging/logger.js')

    const logger = getLogger().withContext({ service: 'worker-startup' })

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
    console.error('Failed to start job worker:', error)
    process.exit(1)
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  startWorker().catch((error) => {
    console.error('Fatal error starting worker:', error)
    process.exit(1)
  })
}

module.exports = { startWorker }
