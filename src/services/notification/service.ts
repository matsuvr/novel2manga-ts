/**
 * Notification Integration Service
 * Handles email notifications for job completion and failure events
 */
import { eq } from 'drizzle-orm'
import { getDatabase } from '@/db'
import { jobs, users } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'

/**
 * Simple notification service that can be called directly
 * This avoids complex Effect TS layer dependencies for easier integration
 */
const logger = getLogger().withContext({ service: 'notification-service' })

async function sendEmail(
  email: string,
  jobId: string,
  status: 'completed' | 'failed',
  errorMessage?: string,
) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.info('SMTP not configured, skipping email notification', { jobId, email })
    return
  }
  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  const jobUrl = `${baseUrl}/portal/jobs/${jobId}`
  const dashboardUrl = `${baseUrl}/portal/dashboard`
  const isCompleted = status === 'completed'
  const subject = isCompleted
    ? '漫画化が完了しました - Novel2Manga'
    : '漫画化でエラーが発生しました - Novel2Manga'
  const html = isCompleted
    ? `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4CAF50;">漫画化が完了しました</h2>
  <p>お疲れ様です！あなたの小説の漫画化処理が正常に完了しました。</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>ジョブID:</strong> ${jobId}</p>
  </div>
  <p><a href="${jobUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">結果を確認する</a></p>
  <p style="color: #666; font-size: 14px; margin-top: 30px;">このメールは自動送信されています。返信はできません。</p>
</div>`
    : `
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #f44336;">漫画化でエラーが発生しました</h2>
  <p>申し訳ございません。あなたの小説の漫画化処理中にエラーが発生しました。</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>ジョブID:</strong> ${jobId}</p>
    ${errorMessage ? `<p><strong>エラー詳細:</strong> ${errorMessage}</p>` : ''}
  </div>
  <p><a href="${dashboardUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">マイページを開く</a></p>
  <p style="color: #666; font-size: 14px; margin-top: 30px;">マイページでエラー内容を確認し、ジョブを再開するか選択できます。<br>問題が解決しない場合は、サポートまでお問い合わせください。<br>このメールは自動送信されています。返信はできません。</p>
</div>`
  const text = isCompleted
    ? `漫画化が完了しました\n\nジョブID: ${jobId}\n${jobUrl}`
    : `漫画化でエラーが発生しました\n\nジョブID: ${jobId}\n${errorMessage ? `エラー詳細: ${errorMessage}\n` : ''}マイページでエラー内容を確認し再開できます:\n${dashboardUrl}`
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Novel2Manga <noreply@novel2manga.com>',
    to: email,
    subject,
    html,
    text,
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
