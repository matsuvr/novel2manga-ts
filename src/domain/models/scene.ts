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
      const missingFields = Array.from(requiredKeys).filter((k) =>
        err.issues.some((i) => i.path.length === 1 && i.path[0] === k),
      )
      throw new ValidationError(
        `Scene normalization failed: missing or invalid required fields: ${missingFields.join(', ')}`,
        undefined,
        {
          issues: err.issues,
          missingFields,
          code: ERROR_CODES.INVALID_INPUT,
        },
      )
    }
    throw err
  }
}
