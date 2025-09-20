import { z } from 'zod'

/**
 * Email configuration derived from environment variables.
 * Validation lives here so that runtime services can assume the shape is safe.
 */
const emailConfigSchema = z
  .object({
    enabled: z.boolean(),
    debug: z.boolean(),
    defaults: z.object({
      from: z.string().trim().min(1).optional(),
      replyTo: z.string().trim().email().optional(),
    }),
    smtp: z.object({
      host: z.string().trim().min(1).optional(),
      port: z.number().int().positive().optional(),
      secure: z.boolean(),
      auth: z.object({
        user: z.string().trim().min(1).optional(),
        pass: z.string().trim().min(1).optional(),
      }),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return
    }

    const missing: string[] = []

    if (!value.smtp.host) {
      missing.push('SMTP_HOST')
    }
    if (!value.smtp.port) {
      missing.push('SMTP_PORT')
    }
    if (!value.smtp.auth.user) {
      missing.push('SMTP_USER')
    }
    if (!value.smtp.auth.pass) {
      missing.push('SMTP_PASS')
    }
    if (!value.defaults.from) {
      missing.push('MAIL_FROM')
    }

    if (missing.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Missing required email configuration values: ${missing.join(', ')}`,
      })
    }
  })

export type EmailConfig = z.infer<typeof emailConfigSchema>

let cachedEmailConfig: EmailConfig | undefined

const toNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * Resolve and validate the email configuration.
 * Throws when EMAIL_ENABLED=true but required values are missing or invalid.
 */
export const getEmailConfig = (): EmailConfig => {
  if (cachedEmailConfig) {
    return cachedEmailConfig
  }

  const rawConfig: EmailConfig = {
    enabled: process.env.EMAIL_ENABLED === 'true',
    debug: process.env.EMAIL_DEBUG === 'true',
    defaults: {
      from: process.env.MAIL_FROM?.trim(),
      replyTo: process.env.MAIL_REPLY_TO?.trim(),
    },
    smtp: {
      host: process.env.SMTP_HOST?.trim(),
      port: toNumber(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER?.trim(),
        pass: process.env.SMTP_PASS?.trim(),
      },
    },
  }

  const result = emailConfigSchema.safeParse(rawConfig)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => issue.message).join('; ')
    throw new Error(`Invalid email configuration: ${issues}`)
  }

  cachedEmailConfig = result.data
  return cachedEmailConfig
}

export const resetEmailConfigCache = () => {
  cachedEmailConfig = undefined
}
