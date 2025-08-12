import { z } from 'zod'

// 共通の感情語彙（レイアウト/解析で共有）
// 許容語彙には一部シノニムも含め、将来的に正規化で集約可能にする
export const EmotionSchema = z.enum([
  'neutral',
  'normal',
  'happy',
  'sad',
  'angry',
  'surprised',
  'fear',
  'disgust',
  'question',
  'shout',
  'thought',
  'think', // synonym of thought
  'inner', // synonym of thought
  'excited',
])

export type Emotion = z.infer<typeof EmotionSchema>

// シノニムを正規形へマップ
const NORMALIZATION_MAP: Record<string, Emotion> = {
  // base
  neutral: 'neutral',
  normal: 'normal',
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  surprised: 'surprised',
  fear: 'fear',
  disgust: 'disgust',
  question: 'question',
  shout: 'shout',
  thought: 'thought',
  excited: 'excited',
  // synonyms
  think: 'thought',
  inner: 'thought',
}

export function normalizeEmotion(value: string | undefined | null): Emotion | undefined {
  if (!value) return undefined
  const key = String(value).toLowerCase().trim()
  // 未知値は安全側で 'normal' にフォールバック
  return NORMALIZATION_MAP[key] ?? 'normal'
}
