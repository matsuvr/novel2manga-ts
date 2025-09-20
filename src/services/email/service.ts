/**
 * Email Service Interface and Implementation using Effect TS
 */
import { Context, Effect, Layer } from 'effect'
import type { Transporter } from 'nodemailer'
import nodemailer from 'nodemailer'
import { type EmailConfig, getEmailConfig } from '@/config/email.config'
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
const createTransportEffect = (): Effect.Effect<
  { transporter: Transporter; config: EmailConfig },
  EmailConfigurationError
> =>
  Effect.gen(function* () {
    const config = getEmailConfig()

    if (!config.enabled) {
      return yield* Effect.fail(
        new EmailConfigurationError('Email notifications are disabled (EMAIL_ENABLED=false).'),
      )
    }

    const { host, port, secure, auth } = config.smtp

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user: auth.user,
        pass: auth.pass,
      },
      logger: config.debug,
      debug: config.debug,
    })

    return { transporter, config }
  })

/**
 * Email Service Live Implementation
 */
export const EmailServiceLive = Layer.effect(
  EmailService,
  Effect.gen(function* () {
    const { transporter, config } = yield* createTransportEffect()
    const fromAddress = config.defaults.from
    const replyToAddress = config.defaults.replyTo

    return {
      sendEmail: (options: EmailOptions) =>
        Effect.tryPromise({
          try: async () => {
            const mailOptions = {
              from: fromAddress,
              to: options.to,
              subject: options.subject,
              html: options.html,
              text: options.text,
              ...(replyToAddress ? { replyTo: replyToAddress } : {}),
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
                from: fromAddress,
                to: email,
                subject: content.subject,
                html: content.html,
                text: content.text,
                ...(replyToAddress ? { replyTo: replyToAddress } : {}),
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
