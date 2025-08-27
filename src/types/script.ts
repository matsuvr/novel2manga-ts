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
})

// Simplified schema for Groq Structured Output - use only 'script' array to avoid deep $refs
export const ScriptSchema = z.object({
  title: z.string().optional(),
  scenes: z.array(
    z.object({
      id: z.string().optional(), // LLM output includes string scene IDs like "scene1"
      setting: z.string().optional(),
      description: z.string().optional(),
      script: z.array(
        z.object({
          index: z.number().int().nonnegative().optional(),
          type: z.enum(['dialogue', 'thought', 'narration', 'stage']),
          speaker: z.string().optional(),
          character: z.string().optional(),
          text: z.string(),
        }),
      ),
    }),
  ),
})

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
              text: z.string().optional(),
              // Deprecated: 'lines' for backward compatibility (will be removed later)
              lines: z.string().optional(),
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
        z.object({
          id: z.number().int().min(1),
          scriptIndexes: z.array(z.number().int().nonnegative()),
        }),
      ),
    }),
  ),
})

export type PanelAssignmentPlan = z.infer<typeof PanelAssignmentSchema>
