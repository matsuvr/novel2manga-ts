import { z } from 'zod'

/**
 * Email configuration derived from environment variables.
 * Use discriminatedUnion on `enabled` so that when enabled=true, required fields are enforced at the schema level.
 */
const enabledSchema = z.object({
  enabled: z.literal(true),
  debug: z.boolean(),
  defaults: z.object({
    from: z.string().trim().min(1, { message: 'MAIL_FROM is required when email is enabled' }),
    replyTo: z.string().trim().email().optional(),
  }),
  smtp: z.object({
    host: z.string().trim().min(1, { message: 'SMTP_HOST is required when email is enabled' }),
    port: z.number().int().positive({ message: 'SMTP_PORT must be a positive integer' }),
    secure: z.boolean(),
    auth: z.object({
      user: z.string().trim().min(1, { message: 'SMTP_USER is required when email is enabled' }),
      pass: z.string().trim().min(1, { message: 'SMTP_PASS is required when email is enabled' }),
    }),
  }),
})

const disabledSchema = z.object({
  enabled: z.literal(false),
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

const emailConfigSchema = z.discriminatedUnion('enabled', [enabledSchema, disabledSchema])

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

  const raw = {
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

  const result = emailConfigSchema.safeParse(raw)

  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message || i.code).join('; ')
    throw new Error(`Invalid email configuration: ${issues}`)
  }

  cachedEmailConfig = result.data
  return cachedEmailConfig
}

export const resetEmailConfigCache = () => {
  cachedEmailConfig = undefined
}
