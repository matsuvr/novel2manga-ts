/**
 * Email Service Interface and Implementation using Effect TS
 */
import { Context, Effect, Layer } from 'effect'
import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'
import { generateJobNotificationContent } from './templates'
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
