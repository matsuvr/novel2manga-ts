import { ZodError, z } from 'zod'
import { ERROR_CODES, ValidationError } from '@/utils/api-error'

// 統一 Scene ドメインモデル / スキーマ集約
// 目的:
//  - text-analysis.ts / database-models.ts / panel-layout.ts で重複していた Scene 定義を単一ソース化
//  - 拡張フィールド(setting, mood, visualElements) をオプショナルで許容しつつ、
//    永続化/厳格分析では必須項目(id, location, description, startIndex, endIndex) を維持
// 設計方針:
//  - SceneFlexibleSchema: 外部入力/LLM 生成直後など不完全な段階でのゆるい受け口
//  - SceneCoreSchema: 分析確定後/永続化用の必須フィールドを要求する厳格版
//  - SceneSchema エイリアス: 既存コード(=従来の SceneSchema ) を Core にマッピング

export const SceneFlexibleSchema = z.object({
  id: z.string().optional(),
  location: z.string().optional(),
  time: z.string().optional(),
  description: z.string().optional(),
  startIndex: z.number().optional(),
  endIndex: z.number().optional(),
  setting: z.string().optional(),
  mood: z.string().optional(),
  visualElements: z.array(z.string()).optional(),
})

export const SceneCoreSchema = SceneFlexibleSchema.extend({
  id: z.string(),
  location: z.string(),
  description: z.string(),
  startIndex: z.number(),
  endIndex: z.number(),
})

// 既存コードが参照していた SceneSchema 名を Core に統一 (段階的移行用)
export { SceneCoreSchema as SceneSchema }

export type Scene = z.infer<typeof SceneCoreSchema>
export type SceneFlexible = z.infer<typeof SceneFlexibleSchema>

// 型ガード (柔軟スキーマ準拠)
export function isSceneDomainModel(value: unknown): value is SceneFlexible {
  const result = SceneFlexibleSchema.safeParse(value)
  return result.success
}

export function normalizeToSceneCore(scene: unknown): Scene {
  // 柔軟な入力 -> 厳格 Scene への正規化
  // 必須フィールド不足時は ValidationError (code=INVALID_INPUT) にラップ
  try {
    // 直接 Core で検証 (Flexible -> Core の二段階は不要なため簡略化)
    return SceneCoreSchema.parse(scene)
  } catch (err) {
    if (err instanceof ZodError) {
      const requiredKeys = new Set(['id', 'location', 'description', 'startIndex', 'endIndex'])
      const missingFields: string[] = []
      const invalidTypeFields: string[] = []

      for (const issue of err.issues) {
        if (issue.path.length === 1) {
          const key = issue.path[0]
          if (requiredKeys.has(String(key))) {
            if (issue.code === 'invalid_type') {
              // Zod invalid_type で received が undefined → 未指定
              // それ以外 (string 期待 number 提供等) → 型不一致
              const received: unknown = (issue as any).received
              if (received === 'undefined' || received === undefined) {
                if (!missingFields.includes(String(key))) missingFields.push(String(key))
              } else {
                if (!invalidTypeFields.includes(String(key))) invalidTypeFields.push(String(key))
              }
            }
          }
        }
      }

      const parts: string[] = []
      if (missingFields.length) parts.push(`missing: ${missingFields.join(', ')}`)
      if (invalidTypeFields.length) parts.push(`invalid type: ${invalidTypeFields.join(', ')}`)
      const summary = parts.length ? parts.join(' | ') : 'validation failed'

      throw new ValidationError(`Scene normalization failed: ${summary}`, undefined, {
        issues: err.issues,
        missingFields,
        // 追加の詳細: 型不一致フィールド
        invalidTypeFields,
        code: ERROR_CODES.INVALID_INPUT,
      })
    }
    throw err
  }
}

// Legacy adapter helper: 旧 boolean ベースの hasTime / hasLocation 判定が残存するコード向け
// （現状利用箇所なし。必要時 panel-layout 等で import して使用）
export function sceneLegacyFlags(scene: SceneFlexible): { hasTime: boolean; hasLocation: boolean } {
  return {
    hasTime: typeof scene.time === 'string' && scene.time.trim().length > 0,
    hasLocation: typeof scene.location === 'string' && scene.location.trim().length > 0,
  }
}
