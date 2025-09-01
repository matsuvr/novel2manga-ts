import { z } from 'zod'
import type { Dialogue } from './panel-layout'

// Request payload to vertical text API (we'll map camelCase to snake_case when sending)
export const VerticalTextRenderRequestSchema = z.object({
  text: z.string().min(1, 'text is required'),
  font: z.enum(['gothic', 'mincho']).optional(), // optional = デフォルトのアンチックフォント
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

/**
 * セリフのタイプに応じて適切なフォントを選択する
 * - narration: 明朝体
 * - thought: ゴシック体
 * - speech または未指定: フォント指定なし（デフォルトのアンチック体）
 */
export function getFontForDialogue(dialogue: Dialogue): 'gothic' | 'mincho' | undefined {
  switch (dialogue.type) {
    case 'narration':
      return 'mincho'
    case 'thought':
      return 'gothic'
    default:
      return undefined // デフォルトのアンチック体
  }
}
