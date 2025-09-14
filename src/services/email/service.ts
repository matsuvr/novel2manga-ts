/**
 * Email Service Interface and Implementation using Effect TS
 */
import { Context, Effect, Layer } from 'effect'
import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'
import {
  EmailConfigurationError,
  EmailError,
  type EmailOptions,
  type JobNotificationData,
} from './types'

/**
 * Email Service Interface
 */
export interface EmailService {
  readonly sendEmail: (options: EmailOptions) => Effect.Effect<void, EmailError>
  readonly sendJobNotification: (
    email: string,
    data: JobNotificationData,
  ) => Effect.Effect<void, EmailError>
}

/**
 * Email Service Context Tag
 */
export const EmailService = Context.GenericTag<EmailService>('EmailService')

/**
 * Create nodemailer transporter with configuration validation
 */
const createTransportEffect = (): Effect.Effect<Transporter, EmailConfigurationError> =>
  Effect.gen(function* () {
    const smtpHost = process.env.SMTP_HOST
    const smtpPort = process.env.SMTP_PORT
    const smtpUser = process.env.SMTP_USER
    const smtpPass = process.env.SMTP_PASS

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return yield* Effect.fail(
        new EmailConfigurationError(
          'Missing required SMTP configuration. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS environment variables.',
        ),
      )
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    return transporter
  })

/**
 * Generate job notification email content
 */
const generateJobNotificationContent = (data: JobNotificationData) => {
  const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'
  const jobUrl = `${baseUrl}/portal/jobs/${data.jobId}`
  const dashboardUrl = `${baseUrl}/portal/dashboard`

  if (data.status === 'completed') {
    return {
      subject: '漫画化が完了しました - Novel2Manga',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #4CAF50;">漫画化が完了しました</h2>
                    <p>お疲れ様です！あなたの小説の漫画化処理が正常に完了しました。</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>ジョブID:</strong> ${data.jobId}</p>
                    </div>
                    <p>
                        <a href="${jobUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            結果を確認する
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 30px;">
                        このメールは自動送信されています。返信はできません。
                    </p>
                </div>
            `,
      text: `
漫画化が完了しました

お疲れ様です！あなたの小説の漫画化処理が正常に完了しました。

ジョブID: ${data.jobId}

結果を確認するには以下のURLにアクセスしてください：
${jobUrl}

このメールは自動送信されています。
            `.trim(),
    }
  } else {
    return {
      subject: '漫画化でエラーが発生しました - Novel2Manga',
      html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #f44336;">漫画化でエラーが発生しました</h2>
                    <p>申し訳ございません。あなたの小説の漫画化処理中にエラーが発生しました。</p>
                    <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                        <p><strong>ジョブID:</strong> ${data.jobId}</p>
                        ${data.errorMessage ? `<p><strong>エラー詳細:</strong> ${data.errorMessage}</p>` : ''}
                    </div>
                    <p>
                        <a href="${dashboardUrl}" style="background-color: #f44336; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                            マイページを開く
                        </a>
                    </p>
                    <p style="color: #666; font-size: 14px; margin-top: 30px;">
                        マイページでエラー内容を確認し、ジョブを再開するか選択できます。<br>
                        問題が解決しない場合は、サポートまでお問い合わせください。<br>
                        このメールは自動送信されています。返信はできません。
                    </p>
                </div>
            `,
      text: `
漫画化でエラーが発生しました

申し訳ございません。あなたの小説の漫画化処理中にエラーが発生しました。

ジョブID: ${data.jobId}
${data.errorMessage ? `エラー詳細: ${data.errorMessage}` : ''}

マイページでエラー内容を確認し、ジョブを再開できます：
${dashboardUrl}

問題が解決しない場合は、サポートまでお問い合わせください。
このメールは自動送信されています。
            `.trim(),
    }
  }
}

/**
 * Email Service Live Implementation
 */
export const EmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const transporter = yield* createTransportEffect()

    return {
      sendEmail: (options: EmailOptions) =>
        Effect.tryPromise({
          try: async () => {
            const mailOptions = {
              from: process.env.MAIL_FROM || 'Novel2Manga <noreply@novel2manga.com>',
              to: options.to,
              subject: options.subject,
              html: options.html,
              text: options.text,
            }

            await transporter.sendMail(mailOptions)
          },
          catch: (error) => new EmailError(`Failed to send email: ${String(error)}`, error),
        }),

      sendJobNotification: (email: string, data: JobNotificationData) =>
        Effect.gen(function* () {
          const content = generateJobNotificationContent(data)

          yield* Effect.tryPromise({
            try: async () => {
              const mailOptions = {
                from: process.env.MAIL_FROM || 'Novel2Manga <noreply@novel2manga.com>',
                to: email,
                subject: content.subject,
                html: content.html,
                text: content.text,
              }

              await transporter.sendMail(mailOptions)
            },
            catch: (error) =>
              new EmailError(`Failed to send job notification: ${String(error)}`, error),
          })
        }),
    }
  }),
)
