/**
 * Extraction V2 Schema Validation
 * Zod schemas for validating LLM output
 */

import { z } from 'zod'
import type { CharacterId, TempCharacterId } from '@/types/extractionV2'

// ========== ID Schemas ==========

const CharacterIdSchema = z.custom<CharacterId>(
  (val) => typeof val === 'string' && val.startsWith('char_'),
  { message: 'Invalid CharacterId format' },
)

const TempCharacterIdSchema = z.custom<TempCharacterId>(
  (val) => typeof val === 'string' && val.startsWith('temp_char_'),
  { message: 'Invalid TempCharacterId format' },
)

// ========== Character Schemas ==========

const PossibleMatchSchema = z.object({
  id: CharacterIdSchema,
  confidence: z.number().min(0).max(1),
})

export const CharacterCandidateV2Schema = z
  .object({
    id: z.union([CharacterIdSchema, TempCharacterIdSchema]),
    name: z.string().min(1),
    aliases: z.array(z.string()),
    description: z.string(),
    firstAppearanceChunk: z.number().nullable(),
    firstAppearance: z.number().min(0).nullable(),
    possibleMatchIds: z.array(PossibleMatchSchema),
  })
  .strict() // Reject unknown fields

// ========== Event Schemas ==========

export const CharacterEventV2Schema = z
  .object({
    characterId: z.union([CharacterIdSchema, TempCharacterIdSchema, z.literal('不明')]),
    action: z.string().min(1),
    index: z.number().min(0),
  })
  .strict()

// ========== Scene Schemas ==========

export const SceneV2Schema = z
  .object({
    location: z.string().min(1),
    time: z.string().nullable(),
    description: z.string(),
    startIndex: z.number().min(0),
    endIndex: z.number().min(0),
  })
  .strict()
  .refine((data) => data.endIndex > data.startIndex, {
    message: 'endIndex must be greater than startIndex',
  })

// ========== Dialogue Schemas ==========

export const DialogueV2Schema = z
  .object({
    speakerId: z.union([CharacterIdSchema, TempCharacterIdSchema, z.literal('不明')]),
    text: z.string().min(1),
    emotion: z.string(),
    index: z.number().min(0),
  })
  .strict()

// ========== Highlight Schemas ==========

const HighlightTypeSchema = z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence'])

export const HighlightV2Schema = z
  .object({
    type: HighlightTypeSchema,
    description: z.string().min(1),
    importance: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    startIndex: z.number().min(0),
    endIndex: z.number().min(0),
  })
  .strict()
  .refine((data) => data.endIndex > data.startIndex, {
    message: 'endIndex must be greater than startIndex',
  })

// ========== Situation Schemas ==========

export const SituationV2Schema = z
  .object({
    description: z.string().min(1),
    index: z.number().min(0),
  })
  .strict()

// ========== Main Extraction Schema ==========

export const ExtractionV2Schema = z
  .object({
    characters: z.array(CharacterCandidateV2Schema),
    characterEvents: z.array(CharacterEventV2Schema),
    scenes: z.array(SceneV2Schema),
    dialogues: z.array(DialogueV2Schema),
    highlights: z.array(HighlightV2Schema),
    situations: z.array(SituationV2Schema),
    pacing: z.string().optional(),
  })
  .strict() // Reject unknown fields

// ========== Memory Schemas (for persistence) ==========

const CharacterStatusSchema = z.enum(['alive', 'dead', 'missing', 'unknown'])

const CharacterTimelineEntrySchema = z.object({
  chunkIndex: z.number().min(0),
  action: z.string(),
  index: z.number().min(0),
})

export const CharacterMemoryJsonSchema = z.object({
  id: CharacterIdSchema,
  names: z.array(z.string()),
  firstAppearanceChunk: z.number().min(0),
  summary: z.string(),
  status: CharacterStatusSchema.optional(),
  relationships: z.record(z.string()),
  timeline: z.array(CharacterTimelineEntrySchema),
  lastSeenChunk: z.number().min(0),
})

export const CharacterMemoryPromptJsonSchema = z.object({
  id: CharacterIdSchema,
  names: z.array(z.string()).max(5), // Limit aliases for prompt
  summary: z.string().max(200), // Truncated for prompt
  lastSeenChunk: z.number().min(0),
})

// ========== Validation Functions ==========

/**
 * Validate extraction result from LLM
 */
export function validateExtraction(
  data: unknown,
): z.SafeParseReturnType<unknown, z.infer<typeof ExtractionV2Schema>> {
  return ExtractionV2Schema.safeParse(data)
}

/**
 * Validate character memory for persistence
 */
export function validateCharacterMemoryJson(
  data: unknown,
): z.SafeParseReturnType<unknown, z.infer<typeof CharacterMemoryJsonSchema>> {
  return CharacterMemoryJsonSchema.safeParse(data)
}

/**
 * Validate character memory for prompt inclusion
 */
export function validateCharacterMemoryPromptJson(
  data: unknown,
): z.SafeParseReturnType<unknown, z.infer<typeof CharacterMemoryPromptJsonSchema>> {
  return CharacterMemoryPromptJsonSchema.safeParse(data)
}

// ========== Type Exports ==========

export type ValidatedExtractionV2 = z.infer<typeof ExtractionV2Schema>
export type ValidatedCharacterMemoryJson = z.infer<typeof CharacterMemoryJsonSchema>
export type ValidatedCharacterMemoryPromptJson = z.infer<typeof CharacterMemoryPromptJsonSchema>

// ========== Error Formatting ==========

/**
 * Format Zod validation errors for logging
 */
export function formatValidationErrors(errors: z.ZodError): string {
  return errors.errors
    .map((err) => {
      const path = err.path.join('.')
      return `${path}: ${err.message}`
    })
    .join('\n')
}

// ========== Index Validation Helpers ==========

/**
 * Validate that all indices in extraction are within bounds
 */
export function validateIndices(
  extraction: ValidatedExtractionV2,
  textLength: number,
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check character first appearances
  for (const char of extraction.characters) {
    if (char.firstAppearance !== null && char.firstAppearance >= textLength) {
      errors.push(
        `Character ${char.name}: firstAppearance ${char.firstAppearance} exceeds text length ${textLength}`,
      )
    }
  }

  // Check character events
  for (const event of extraction.characterEvents) {
    if (event.index >= textLength) {
      errors.push(`CharacterEvent: index ${event.index} exceeds text length ${textLength}`)
    }
  }

  // Check scenes
  for (const scene of extraction.scenes) {
    if (scene.startIndex >= textLength) {
      errors.push(`Scene: startIndex ${scene.startIndex} exceeds text length ${textLength}`)
    }
    if (scene.endIndex > textLength) {
      errors.push(`Scene: endIndex ${scene.endIndex} exceeds text length ${textLength}`)
    }
  }

  // Check dialogues
  for (const dialogue of extraction.dialogues) {
    if (dialogue.index >= textLength) {
      errors.push(`Dialogue: index ${dialogue.index} exceeds text length ${textLength}`)
    }
  }

  // Check highlights
  for (const highlight of extraction.highlights) {
    if (highlight.startIndex >= textLength) {
      errors.push(`Highlight: startIndex ${highlight.startIndex} exceeds text length ${textLength}`)
    }
    if (highlight.endIndex > textLength) {
      errors.push(`Highlight: endIndex ${highlight.endIndex} exceeds text length ${textLength}`)
    }
  }

  // Check situations
  for (const situation of extraction.situations) {
    if (situation.index >= textLength) {
      errors.push(`Situation: index ${situation.index} exceeds text length ${textLength}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
