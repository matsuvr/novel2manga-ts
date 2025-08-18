import { z } from 'zod'

// 感情は任意の文字列を受け入れる（列挙・正規化は行わない）
export const EmotionSchema = z.string()

// ドメインとしては単なる文字列
export type Emotion = string
