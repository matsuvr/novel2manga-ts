/**
 * Notification Integration Service
 * Handles email notifications for job completion and failure events
 */
import { eq } from 'drizzle-orm'
import { getDatabase } from '@/db'
import { jobs, users } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { generateJobNotificationContent } from '@/services/email/templates'

/**
 * Simple notification service that can be called directly
 * This avoids complex Effect TS layer dependencies for easier integration
 */
const logger = getLogger().withContext({ service: 'notification-service' })

let transporter: import('nodemailer').Transporter | undefined

const getTransporter = async () => {
  if (transporter) return transporter
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return undefined
  const nodemailer = await import('nodemailer')
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return transporter
}

async function sendEmail(
  email: string,
  jobId: string,
  status: 'completed' | 'failed',
  errorMessage?: string,
) {
  const transporter = await getTransporter()
  if (!transporter) {
    logger.info('SMTP not configured, skipping email notification', { jobId, email })
    return
  }

  const content = generateJobNotificationContent({ jobId, status, errorMessage })

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Novel2Manga <noreply@novel2manga.com>',
    to: email,
    subject: content.subject,
    html: content.html,
    text: content.text,
  })
}

export const notificationService = {
  async sendJobCompletionNotification(
    jobId: string,
    status: 'completed' | 'failed',
    errorMessage?: string,
  ): Promise<void> {
    try {
      const db = getDatabase()
      // Record notification in outbox table first for idempotency.
      // If already recorded (unique violation), skip sending.
      try {
        // Obtain properly constructed service via the unified database services
        const { db } = await import('@/services/database')
        const svc = db.jobs()
        const firstTime = await svc.recordNotification(jobId, status)
        if (!firstTime) {
          logger.info('Notification already recorded, skipping send', { jobId, status })
          return
        }
      } catch (e) {
        // If DB service is unavailable or throws (e.g., during legacy tests), continue best-effort
        logger.warn('recordNotification failed or unavailable, proceeding best-effort', {
          jobId,
          status,
          error: e instanceof Error ? e.message : String(e),
        })
      }
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
      await sendEmail(user.email, jobId, status, errorMessage)
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
