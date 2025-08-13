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
    // 雛形実装: 実際の送信プロバイダ（SendGrid/SES等）に置き換える
    // CI/開発時はログのみ
    console.log('[Notification] sendJobCompletionEmail', { email, payload })
  }
}

let singleton: NotificationService | null = null

export function getNotificationService(): NotificationService {
  // 将来的に環境変数でプロバイダ切替（SENDGRID/SESなど）
  if (!singleton) singleton = new ConsoleNotificationService()
  return singleton
}
