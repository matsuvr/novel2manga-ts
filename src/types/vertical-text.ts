import { z } from 'zod'
import type { Dialogue } from './panel-layout'

const VerticalTextBoundsSchema = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  })
  .passthrough()

export type VerticalTextBounds = z.infer<typeof VerticalTextBoundsSchema>

// Request payload to vertical text API (we'll map camelCase to snake_case when sending)
export const VerticalTextRenderRequestSchema = z.object({
  text: z.string().min(1, 'text is required'),
  // 'antique' を明示的に許容: 無指定または 'antique' の場合 API デフォルト(アンチック体)
  font: z.enum(['antique', 'gothic', 'mincho']).optional(), // optional or 'antique' = アンチック
  fontSize: z.number().int().positive().optional(),
  lineHeight: z.number().positive().optional(),
  letterSpacing: z.number().optional(),
  padding: z.number().int().nonnegative().optional(),
  maxCharsPerLine: z.number().int().positive().optional(),
})

export type VerticalTextRenderRequest = z.infer<typeof VerticalTextRenderRequestSchema>

// API returns base64 PNG and dimensions
export const VerticalTextRenderResponseSchema = z
  .object({
    image_base64: z.string().min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    processing_time_ms: z.number().nonnegative().optional(),
    trimmed: z.boolean().optional(),
    // 実際に使用されたフォント名（APIの仕様上、antique/gothic/mincho のいずれか。将来拡張に備えてstring許容）
    font: z.string().optional(),
    content_bounds: VerticalTextBoundsSchema.optional(),
    bounding_box: VerticalTextBoundsSchema.optional(),
    contentBounds: VerticalTextBoundsSchema.optional(),
    boundingBox: VerticalTextBoundsSchema.optional(),
    line_bounds: z.array(VerticalTextBoundsSchema).optional(),
    lineBounds: z.array(VerticalTextBoundsSchema).optional(),
  })
  .passthrough()

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function coerceBounds(candidate: unknown): VerticalTextBounds | undefined {
  if (!isRecord(candidate)) return undefined
  const maybe = VerticalTextBoundsSchema.safeParse(candidate)
  return maybe.success ? maybe.data : undefined
}

export function resolveContentBounds(meta: VerticalTextRenderResponse): VerticalTextBounds | undefined {
  const direct =
    meta.content_bounds ||
    meta.bounding_box ||
    meta.contentBounds ||
    meta.boundingBox

  if (direct) {
    const resolved = coerceBounds(direct)
    if (resolved) return resolved
  }

  if (isRecord((meta as unknown as { layout?: unknown }).layout)) {
    const layout = (meta as unknown as { layout: Record<string, unknown> }).layout
    const nested =
      layout.content_bounds ||
      layout.bounding_box ||
      layout.contentBounds ||
      layout.boundingBox
    const resolved = coerceBounds(nested)
    if (resolved) return resolved
  }

  const fallback =
    coerceBounds((meta as Record<string, unknown>).text_bounds) ||
    coerceBounds((meta as Record<string, unknown>).textBounds)
  if (fallback) return fallback

  return undefined
}

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
        // NOTE: undefined を返す = API には font を送らずデフォルト(アンチック)を利用する。
        // 'antique' を明示的に送ることと意味的に同義。payload最小化のため省略。
        return undefined
    }
  }

  // 後方互換: 話者名から推測
  if (dialogue.speaker === 'ナレーション') return 'mincho'
  if (dialogue.speaker?.includes('（心の声）')) return 'gothic'
  // type が無く、特別な推測条件にも当てはまらない場合も undefined (＝ 'antique' 相当)
  return undefined
}
