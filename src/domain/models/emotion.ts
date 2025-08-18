import { z } from 'zod'

// 感情は任意文字列を受け入れる（分類は行わない）
export const EmotionSchema = z.string()

export type Emotion = string

// 任意文字列をそのまま返す（空・未定義は undefined）
export function normalizeEmotion(value: string | undefined | null): Emotion | undefined {
  if (value == null) return undefined
  const v = String(value).trim()
  if (v === '') return undefined

  // シノニム辞書による正規化
  const synonymMap: Record<string, Emotion> = {
    think: 'thought',
    inner: 'thought',
  }

  const normalized = synonymMap[v.toLowerCase()]
  if (normalized) return normalized

  // 未知の値は 'normal' にフォールバック（非本番環境では警告）
  if (process.env.NODE_ENV !== 'production') {
    if (!['normal', 'happy', 'sad', 'angry', 'surprised', 'fear', 'thought'].includes(v)) {
      console.warn(`Unknown emotion value: ${v}, falling back to 'normal'`)
      return 'normal'
    }
  }

  return v
}
