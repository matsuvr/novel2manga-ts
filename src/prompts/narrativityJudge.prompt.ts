import { NarrativeJudgeSchema } from '@/types/validation'

/**
 * System message: strict JSON-only classifier.
 * - Japanese inputs common; response must be JSON ONLY (no extra text).
 * - “Narrative” includes novel / short story / play / rakugo.
 */
export const NARRATIVITY_JUDGE_SYSTEM = `
You are a strict JSON-only classifier.
Decide if the input text is NARRATIVE FICTION (novel / short story / play / rakugo) or NON-FICTION (manual / report / textbook / news / blog / etc.).
Output ONLY compact JSON with fields: isNarrative (boolean), kind (one of: novel, short_story, play, rakugo, nonfiction, report, manual, other), confidence (0..1), reason (<=160 chars JP).
NO prose, NO markdown—JSON ONLY.
`.trim()

export function buildNarrativityJudgeUser(inputText: string): string {
  return `
【判定対象テキスト】
${inputText}
`.trim()
}

/** Optional guard to post-validate model output with Zod. */
export function parseNarrativityJudge(jsonText: string) {
  const parsed = JSON.parse(jsonText)
  return NarrativeJudgeSchema.parse(parsed)
}

/** Suggested temperature / style for router call */
export const NARRATIVITY_JUDGE_GEN_CFG = {
  temperature: 0.0,
  maxTokens: 256,
} as const
