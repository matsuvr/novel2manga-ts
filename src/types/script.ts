import { z } from 'zod'

const NonNullString = z.preprocess((val) => (val == null ? '' : val), z.string())
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
  speaker: NonNullString.optional(),
  text: NonNullString,
})

export const ScriptSchema = z.object({ script: z.array(ScriptLineSchema) })

export type Script = z.infer<typeof ScriptSchema>
export type ScriptLine = z.infer<typeof ScriptLineSchema>

export const PageBreakSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.number().int().min(1),
      startIndex: z.number().int().nonnegative(),
      endIndex: z.number().int().nonnegative(),
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
