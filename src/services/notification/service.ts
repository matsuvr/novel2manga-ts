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
  // eslint-disable-next-line no-console
  // eslint-disable-next-line no-console
  const metaUrl =
    (typeof import.meta !== 'undefined' && (import.meta as unknown as { url?: string }).url) ||
    'unknown'
  // eslint-disable-next-line no-console
  console.log('[notification/service] module url:', metaUrl)
}
