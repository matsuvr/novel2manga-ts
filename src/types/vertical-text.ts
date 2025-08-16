import { z } from 'zod'

// Request payload to vertical text API (we’ll map camelCase to snake_case when sending)
export const VerticalTextRenderRequestSchema = z.object({
  text: z.string().min(1, 'text is required'),
  fontSize: z.number().int().positive().optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  padding: z.number().int().nonnegative().optional(),
  maxCharsPerLine: z.number().int().positive().optional(),
})

export type VerticalTextRenderRequest = z.infer<typeof VerticalTextRenderRequestSchema>

// API returns base64 PNG and dimensions
export const VerticalTextRenderResponseSchema = z.object({
  image_base64: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  processing_time_ms: z.number().nonnegative().optional(),
  trimmed: z.boolean().optional(),
})

export type VerticalTextRenderResponse = z.infer<typeof VerticalTextRenderResponseSchema>
