import { z } from 'zod'
import { EmotionSchema } from '@/domain/models/emotion'
import { SceneSchema } from '@/domain/models/scene'
export { SceneSchema } // 以前の公開API維持: tests 等が直接 import { SceneSchema } from '.../text-analysis' を想定

// 登場人物スキーマ
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  firstAppearance: z.number(), // テキスト内での初登場位置（インデックス）
})

// SceneSchema は domain/models/scene.ts の統一定義を利用

// 対話スキーマ
export const DialogueSchema = z.object({
  id: z.string(),
  speakerId: z.string(), // Character.idへの参照
  text: z.string(),
  emotion: EmotionSchema.optional(), // 感情（共通語彙に準拠）
  index: z.number(), // テキスト内での位置
})

// ハイライトスキーマ（重要なシーン）
export const HighlightSchema = z.object({
  id: z.string(),
  type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
  description: z.string(),
  importance: z.number(), // 1-5の重要度
  startIndex: z.number(),
  endIndex: z.number(),
})

// 状況説明スキーマ
export const SituationSchema = z.object({
  id: z.string(),
  description: z.string(),
  index: z.number(), // テキスト内での位置
})

// テキスト解析結果の統合スキーマ
// Note: これはNovelAnalysisに統合されるため、実際にはR2に保存される
export const TextAnalysisSchema = z.object({
  id: z.string(),
  chunkId: z.string().optional(), // ChunkAnalysisの場合
  characters: z.array(CharacterSchema),
  scenes: z.array(SceneSchema),
  dialogues: z.array(DialogueSchema),
  highlights: z.array(HighlightSchema),
  situations: z.array(SituationSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

// TypeScript型定義のエクスポート
export type Character = z.infer<typeof CharacterSchema>
export type Scene = z.infer<typeof SceneSchema>
export type Dialogue = z.infer<typeof DialogueSchema>
export type Highlight = z.infer<typeof HighlightSchema>
export type Situation = z.infer<typeof SituationSchema>
export type TextAnalysis = z.infer<typeof TextAnalysisSchema>

// バリデーション関数
export function validateTextAnalysis(data: unknown): TextAnalysis {
  return TextAnalysisSchema.parse(data)
}

export function validateCharacter(data: unknown): Character {
  return CharacterSchema.parse(data)
}

export function validateScene(data: unknown): Scene {
  return SceneSchema.parse(data)
}

export function validateDialogue(data: unknown): Dialogue {
  return DialogueSchema.parse(data)
}

export function validateHighlight(data: unknown): Highlight {
  return HighlightSchema.parse(data)
}

export function validateSituation(data: unknown): Situation {
  return SituationSchema.parse(data)
}
