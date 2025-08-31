import { z } from 'zod'

// ============================
// スクリプト変換スキーマ（Scenes廃止、Panels直下）
// ネストの深さを最大4に抑制（Groq Structured Outputs対策）
// ============================

// Character schema (最大深度: 2レベル)
export const MangaCharacterSchema = z.object({
  id: z.string(),
  name_ja: z.string(),
  role: z.string(),
  speech_style: z.string(),
  aliases: z.array(z.string()),
})

// Location schema (最大深度: 2レベル)
export const MangaLocationSchema = z.object({
  id: z.string(),
  name_ja: z.string(),
  notes: z.string(),
})

// Props schema (最大深度: 2レベル)
export const MangaPropsSchema = z.object({
  name: z.string(),
  continuity: z.string(),
})

// Panel schema（dialogueは "名前: セリフ" の文字列配列）
export const MangaPanelSchema = z.object({
  no: z.number().int().min(1),
  cut: z.string(),
  camera: z.string(),
  narration: z.array(z.string()).optional(),
  dialogue: z.array(z.string()).optional(),
  sfx: z.array(z.string()).optional(),
  importance: z.number().int(), // 1-6の重要度（プロンプトで制約、後でclamping処理）
})

// New manga script schema（panels直下）
export const NewMangaScriptSchema = z.object({
  style_tone: z.string(),
  style_art: z.string(),
  style_sfx: z.string(),
  characters: z.array(MangaCharacterSchema),
  locations: z.array(MangaLocationSchema),
  props: z.array(MangaPropsSchema),
  panels: z.array(MangaPanelSchema),
  continuity_checks: z.array(z.string()),
  coverageStats: z
    .object({
      coverageRatio: z.number().min(0).max(1),
      missingPoints: z.array(z.string()).default([]),
      overSummarized: z.boolean().default(false),
    })
    .optional(),
})

// Type exports
export type NewMangaScript = z.infer<typeof NewMangaScriptSchema>
export type MangaCharacter = z.infer<typeof MangaCharacterSchema>
export type MangaLocation = z.infer<typeof MangaLocationSchema>
export type MangaProps = z.infer<typeof MangaPropsSchema>
export type MangaPanel = z.infer<typeof MangaPanelSchema>

// ============================
// Page Break V2 Schema (retained for layout generation)
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
      sfx: z.array(z.string()).optional(), // SFX support added
    }),
  ),
})

export type PageBreakV2 = z.infer<typeof PageBreakV2Schema>

// ============================
// Coverage Assessment (LLM judge)
// ============================

export const CoverageAssessmentSchema = z.object({
  coverageRatio: z.number().min(0).max(1),
  missingPoints: z.array(z.string()).default([]),
  overSummarized: z.boolean().default(false),
  notes: z.string().optional(),
})

export type CoverageAssessment = z.infer<typeof CoverageAssessmentSchema>

// ============================
// Episode Break Detection Schema
// ============================

export const EpisodeBreakSchema = z.object({
  episodes: z.array(
    z.object({
      episodeNumber: z.number().int().min(1),
      title: z.string().optional(),
      startPanelIndex: z.number().int().min(1),
      endPanelIndex: z.number().int().min(1),
      description: z.string().optional(),
    }),
  ),
})

export type EpisodeBreakPlan = z.infer<typeof EpisodeBreakSchema>

// ============================
// Panel Assignment Schema (retained for layout generation)
// ============================

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
