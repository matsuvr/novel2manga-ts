/**
 * Notification Integration Service
 * Handles email notifications for job completion and failure events
 */
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { type EmailConfig, getEmailConfig } from '@/config/email.config'
import { getDatabase } from '@/db'
import { jobs, users } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { EmailService, EmailServiceLive, type JobNotificationData } from '@/services/email'

/**
 * Simple notification service that can be called directly
 * This avoids complex Effect TS layer dependencies for easier integration
 */
const logger = getLogger().withContext({ service: 'notification-service' })

const runEmailEffect = async (recipient: string, payload: JobNotificationData): Promise<void> => {
  const program = Effect.gen(function* () {
    const emailService = yield* EmailService
    yield* emailService.sendJobNotification(recipient, payload)
  })

  await Effect.runPromise(program.pipe(Effect.provide(EmailServiceLive)))
}

export const notificationService = {
  async sendJobCompletionNotification(
    jobId: string,
    status: 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      let emailConfig: EmailConfig

      try {
        emailConfig = getEmailConfig()
      } catch (configError) {
        logger.error('Invalid email configuration', {
          jobId,
          status,
          error:
            configError instanceof Error ? configError.message : String(configError),
        })
        return
      }

      if (!emailConfig.enabled) {
        logger.info('Email notifications disabled, skipping job notification', {
          jobId,
          status,
        })
        return
      }

      const db = getDatabase()
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
      if (!job) {
        logger.warn('Job not found for notification', { jobId })
        return
      }
      if (!job.userId) {
        logger.warn('Job has no associated user, skipping notification', { jobId })
        return
      }
      const [user] = await db.select().from(users).where(eq(users.id, job.userId))
      if (!user) {
        logger.warn('User not found for notification', { jobId, userId: job.userId })
        return
      }
      if (!user.emailNotifications) {
        logger.info('User has email notifications disabled, skipping', {
          jobId,
          userId: job.userId,
        })
        return
      }
      if (!user.email) {
        logger.warn('User has no email address, cannot send notification', {
          jobId,
          userId: job.userId,
        })
        return
      }

      await runEmailEffect(user.email, { jobId, status, errorMessage })

      logger.info('Job notification sent successfully', {
        jobId,
        userId: job.userId,
        email: user.email,
        status,
      })
    } catch (error) {
      logger.error('Failed to send job notification', {
        jobId,
        status,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },
}

// Export type alias for consumers expecting a NotificationService type
export type NotificationService = typeof notificationService

// DEBUG: expose prototype keys during test to diagnose missing method issue
// eslint-disable-next-line no-console
if (process.env.VITEST) {
  const metaUrl =
    (typeof import.meta !== 'undefined' && (import.meta as unknown as { url?: string }).url) ||
    'unknown'
  // Some test setups provide a lightweight logger mock that may not expose
  // `debug`. Guard the call to avoid TypeErrors in the test environment.
  try {
    const ctx = getLogger().withContext({ service: 'notification-service' }) as unknown
    // Narrow to an object with optional methods safely without using `any`.
    if (ctx && typeof ctx === 'object') {
      const maybeLogger = ctx as { debug?: (...args: unknown[]) => unknown; info?: (...args: unknown[]) => unknown }
      if (typeof maybeLogger.debug === 'function') {
        maybeLogger.debug('module_loaded', { moduleUrl: metaUrl })
      } else if (typeof maybeLogger.info === 'function') {
        // Fallback to info for test diagnostics if debug is unavailable
        maybeLogger.info('module_loaded', { moduleUrl: metaUrl })
      }
    }
  } catch {
    // swallow errors during test-time diagnostics - not critical
  }
}
