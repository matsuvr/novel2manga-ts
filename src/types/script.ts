import { z } from 'zod'

// Cerebras-compatible schema: avoid z.preprocess() which creates complex $defs references
export const ScriptLineSchema = z.object({
  index: z.number().int().nonnegative(),
  type: z.enum(['dialogue', 'thought', 'narration', 'stage']).or(
    z.string().transform((v) => {
      const t = String(v).toLowerCase()
      if (t === 'dialogue' || t === 'thought' || t === 'narration' || t === 'stage') return t
      // 予期しない値は narration に丸める（エラー隠蔽ではなく型整合のための正規化）
      return 'stage'
    }),
  ),
  speaker: z.string().default('').optional(),
  text: z.string().default(''),
})

export const ScriptSchema = z.object({ script: z.array(ScriptLineSchema) })

export type Script = z.infer<typeof ScriptSchema>
export type ScriptLine = z.infer<typeof ScriptLineSchema>

export const PageBreakSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      panelCount: z.number().int().min(1).max(6),
      panels: z.array(
        z.object({
          panelIndex: z.number().int().min(1),
          content: z.string(),
          dialogue: z.array(
            z.object({
              speaker: z.string(),
              lines: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
})

export type PageBreakPlan = z.infer<typeof PageBreakSchema>

export const PanelAssignmentSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      panelCount: z.number().int().min(1).max(8),
      panels: z.array(
        z.object({ id: z.number().int().min(1), lines: z.array(z.number().int().nonnegative()) }),
      ),
    }),
  ),
})

export type PanelAssignmentPlan = z.infer<typeof PanelAssignmentSchema>
