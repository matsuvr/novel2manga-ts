import { ExplainerCharactersSchema } from '@/types/characters'

/**
 * Creates 2–3 explainer personas for a learning/explanatory manga.
 * Output must be a JSON array of 2–3 items (ExplainerCharacter).
 * Language: Japanese for all textual fields.
 */
export const EXPLAINER_CHARS_SYSTEM = `
You create memorable teaching personas for a Japanese learning comic.
Constraints:
- Output STRICT JSON array of 2–3 objects with fields:
  id, name, role ("Teacher"|"Student"|"Skeptic"|"Expert"|"Narrator"|"Other"), voice, style, quirks?, goal?
- Keep names short and distinct. Keep voices/styles concise (<= 120 JP chars each).
- JSON ONLY. No markdown, no prose.
`.trim()

export function buildExplainerCharsUser(contentSummary: string) {
  return `
【題材の要約／トピック】
${contentSummary}

【目的】
読者（初学者）にわかりやすく、テンポ良く、誤解なく要点を説明する。
`.trim()
}

export function parseExplainerChars(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return ExplainerCharactersSchema.parse(parsed)
}

/** Suggested generation config */
export const EXPLAINER_CHARS_GEN_CFG = {
  temperature: 0.6,
  maxTokens: 512,
} as const
