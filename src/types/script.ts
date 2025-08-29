import { z } from 'zod'

// Groq Structured Output compatible schema: simplified to avoid problematic $refs
export const ScriptLineSchema = z.object({
  index: z.number().int().nonnegative().optional(), // LLM output may not include index
  type: z.enum(['dialogue', 'thought', 'narration', 'stage']).or(
    z.string().transform((v) => {
      const t = String(v).toLowerCase()
      if (t === 'dialogue' || t === 'thought' || t === 'narration' || t === 'stage') return t
      // 予期しない値は narration に丸める（エラー隠蔽ではなく型整合のための正規化）
      return 'stage'
    }),
  ),
  speaker: z.string().default('').optional(),
  character: z.string().optional(), // LLM uses 'character' instead of 'speaker'
  text: z.string().default(''),
  // 原文対応のための追加フィールド（プロンプトで要求）
  sourceStart: z.number().int().nonnegative().optional(),
  sourceEnd: z.number().int().nonnegative().optional(),
  sourceQuote: z.string().optional(),
  isContinuation: z.boolean().optional(),
})

// Simplified schema for Groq Structured Output - use only 'script' array to avoid deep $refs
export const ScriptSchema = z.object({
  title: z.string().optional(),
  scenes: z.array(
    z.object({
      id: z.string().optional(), // LLM output includes string scene IDs like "scene1"
      setting: z.string().optional(),
      description: z.string().optional(),
      script: z.array(ScriptLineSchema),
    }),
  ),
  // 変換器の自己検証情報（省略可）
  coverageStats: z
    .object({
      totalChars: z.number().int().nonnegative(),
      coveredChars: z.number().int().nonnegative(),
      coverageRatio: z.number().min(0).max(1),
      uncoveredCount: z.number().int().nonnegative(),
      // NOTE: Groq Structured Output が要求する JSON Schema 2020-12 互換のため、
      // tuple (number[]) ではなく明確なオブジェクト配列に変更
      // { start: number, end: number } の配列とする
      uncoveredSpans: z.array(
        z.object({
          start: z.number().int().nonnegative(),
          end: z.number().int().nonnegative(),
        }),
      ),
    })
    .optional(),
  needsRetry: z.boolean().optional(),
})

export type Script = z.infer<typeof ScriptSchema>
export type ScriptLine = z.infer<typeof ScriptLineSchema>

// ============================
// ScriptV2: 浅いスキーマ（深さ<=5）
// ルート直下に一次元の script 配列のみを持つ
// scenesは廃止し、sceneIndexでまとまりを表現
// ============================

export const ScriptV2LineSchema = z.object({
  sceneIndex: z.number().int().min(1).default(1),
  // NOTE: Structured Outputのスキーマを浅く保つため、union/anyOfは使わずenumのみ
  type: z.enum(['dialogue', 'thought', 'narration', 'stage']),
  speaker: z.string().default('').optional(),
  character: z.string().optional(),
  text: z.string().default(''),
  sourceStart: z.number().int().nonnegative().optional(),
  sourceEnd: z.number().int().nonnegative().optional(),
  sourceQuote: z.string().optional(),
  isContinuation: z.boolean().optional(),
})

export const ScriptV2Schema = z.object({
  title: z.string().optional(),
  // LLM応答は最低1行以上を要求（request用JSON SchemaではminItemsはGroqで削除される）
  script: z.array(ScriptV2LineSchema).min(1),
  coverageStats: z
    .object({
      totalChars: z.number().int().nonnegative(),
      coveredChars: z.number().int().nonnegative(),
      coverageRatio: z.number().min(0).max(1),
      uncoveredCount: z.number().int().nonnegative(),
      uncoveredSpans: z.array(
        z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }),
      ),
    })
    .optional(),
  needsRetry: z.boolean().optional(),
})

export type ScriptV2 = z.infer<typeof ScriptV2Schema>
export type ScriptV2Line = z.infer<typeof ScriptV2LineSchema>

export const PageBreakSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      panelCount: z.number().int().min(1).max(6),
      panels: z.array(
        z.object({
          panelIndex: z.number().int().min(1),
          content: z.string(),
          dialogue: z
            .array(
              z.object({
                speaker: z.string(),
                text: z.string(),
                // Deprecated: 'lines' for backward compatibility (will be removed later)
                lines: z.string().optional(),
              }),
            )
            .optional(),
        }),
      ),
    }),
  ),
})

export type PageBreakPlan = z.infer<typeof PageBreakSchema>

// ============================
// PageBreakV2: 浅いスキーマ（深さ<=5）
// ルートに panels[] を置き、pages 階層を廃止
// ============================

export const PageBreakV2Schema = z.object({
  panels: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      panelIndex: z.number().int().min(1),
      content: z.string(),
      dialogue: z
        .array(
          z.object({
            speaker: z.string(),
            text: z.string(),
          }),
        )
        .optional(),
    }),
  ),
})

export type PageBreakV2 = z.infer<typeof PageBreakV2Schema>

export const PanelAssignmentSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      panelCount: z.number().int().min(1).max(8),
      panels: z.array(
        z.object({
          id: z.number().int().min(1),
          scriptIndexes: z.array(z.number().int().nonnegative()),
        }),
      ),
    }),
  ),
})

export type PanelAssignmentPlan = z.infer<typeof PanelAssignmentSchema>
