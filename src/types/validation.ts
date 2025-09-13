import { z } from 'zod'

/** High-level result of the new InputValidationStep. */
export type InputValidationStatus = 'OK' | 'SHORT' | 'NON_NARRATIVE' | 'LLM_ERROR'

/** Coarse classification of text kind. */
export type NarrativeKind =
  | 'novel'
  | 'short_story'
  | 'play'
  | 'rakugo'
  | 'nonfiction'
  | 'report'
  | 'manual'
  | 'other'

/** JSON returned by the narrativity judge prompt. */
export interface NarrativeJudgeResult {
  isNarrative: boolean
  kind: NarrativeKind
  confidence: number // 0..1
  reason: string // brief classifier rationale
}

/** Zod schema for safe parsing of NarrativeJudgeResult JSON. */
export const NarrativeJudgeSchema = z.object({
  isNarrative: z.boolean(),
  kind: z.enum([
    'novel',
    'short_story',
    'play',
    'rakugo',
    'nonfiction',
    'report',
    'manual',
    'other',
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1),
})

/** Server → client hint when consent is required. */
export type ConsentRequired =
  | 'EXPAND' // short input → ask to let AI expand to ~3000 chars
  | 'EXPLAINER' // non-narrative → ask to convert to learning manga

export interface ValidationOutcome {
  status: InputValidationStatus
  consentRequired?: ConsentRequired
  judge?: NarrativeJudgeResult
}
