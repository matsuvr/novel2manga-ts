export interface JobNotificationPayload {
  jobId: string
  status: 'completed' | 'failed'
  completedAt?: string
  errorMessage?: string
}

export interface NotificationService {
  sendJobCompletionEmail: (email: string, payload: JobNotificationPayload) => Promise<void>
}

class ConsoleNotificationService implements NotificationService {
  async sendJobCompletionEmail(email: string, payload: JobNotificationPayload): Promise<void> {
    const enabled = process.env.NOTIFICATIONS_ENABLED === 'true'
    if (enabled) {
      // TODO: 実際の送信実装（SendGrid/SES）
      console.log('[Notification] (stub) would send email', { email, payload })
    } else {
      // 開発/テスト時のデフォルト動作
      console.log('[Notification] (disabled) sendJobCompletionEmail', { email, payload })
    }
  }
}

let singleton: NotificationService | null = null

export function getNotificationService(): NotificationService {
  // 将来的に環境変数でプロバイダ切替（SENDGRID/SESなど）
  if (!singleton) singleton = new ConsoleNotificationService()
  return singleton
}
