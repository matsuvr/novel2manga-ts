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
  // 実際に使用されたフォント名（APIの仕様上、antique/gothic/mincho のいずれか。将来拡張に備えてstring許容）
  font: z.string().optional(),
})

export type VerticalTextRenderResponse = z.infer<typeof VerticalTextRenderResponseSchema>

// Batch API
export const VerticalTextBatchRequestItemSchema = VerticalTextRenderRequestSchema

// defaults は items に適用する共通の描画パラメータであり、text は含まれない
const VerticalTextBatchDefaultsSchema = VerticalTextRenderRequestSchema.omit({ text: true })

export const VerticalTextBatchRequestSchema = z.object({
  defaults: VerticalTextBatchDefaultsSchema.optional(),
  items: z
    .array(VerticalTextBatchRequestItemSchema)
    .min(1, 'items must not be empty')
    .max(50, 'items length must be <= 50'),
})

export type VerticalTextBatchRequest = z.infer<typeof VerticalTextBatchRequestSchema>

export const VerticalTextBatchResponseSchema = z.object({
  results: z.array(VerticalTextRenderResponseSchema),
})

export type VerticalTextBatchResponse = z.infer<typeof VerticalTextBatchResponseSchema>

/**
 * セリフのタイプに応じて適切なフォントを選択する
 * - narration: 明朝体
 * - thought: ゴシック体
 * - speech または未指定: フォント指定なし（デフォルトのアンチック体）
 */
export function getFontForDialogue(dialogue: Dialogue): 'gothic' | 'mincho' | undefined {
  // 明示的なtypeを優先
  if (dialogue.type) {
    switch (dialogue.type) {
      case 'narration':
        return 'mincho'
      case 'thought':
        return 'gothic'
      default:
        return undefined
    }
  }

  // 後方互換: 話者名から推測
  if (dialogue.speaker === 'ナレーション') return 'mincho'
  if (dialogue.speaker?.includes('（心の声）')) return 'gothic'
  return undefined
}
