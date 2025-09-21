import { Data, Effect } from 'effect'
import { z } from 'zod'

export type ChunkConversionCharacterId = `c${number}`

export const ChunkConversionCharacterIdPattern = /^c\d+$/

export const ChunkConversionCharacterIdSchema = z.custom<ChunkConversionCharacterId>(
  (value): value is ChunkConversionCharacterId =>
    typeof value === 'string' && ChunkConversionCharacterIdPattern.test(value),
  {
    message: 'Invalid character id format (expected c<number>)',
  },
)

export const ChunkConversionPossibleMatchSchema = z
  .object({
    id: ChunkConversionCharacterIdSchema,
    confidence: z.number().min(0).max(1),
  })
  .strict()

export const ChunkConversionCharacterSchema = z
  .object({
    id: ChunkConversionCharacterIdSchema,
    name: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    description: z.string().min(10).max(240),
    firstAppearanceChunk: z.number().int().min(0).nullable(),
    firstAppearance: z.number().int().min(0).nullable(),
    possibleMatchIds: z.array(ChunkConversionPossibleMatchSchema).default([]),
  })
  .strict()

export const ChunkConversionSceneSchema = z
  .object({
    location: z.string().min(1),
    time: z.string().min(1).nullable(),
    description: z.string().min(1),
  })
  .strict()

const ensureEndIndexGreaterThanStart = (value: {
  startIndex?: number
  endIndex?: number
}): boolean => {
  const s = Number(value.startIndex ?? NaN)
  const e = Number(value.endIndex ?? NaN)
  return Number.isFinite(s) && Number.isFinite(e) && e > s
}

export const ChunkConversionSituationSchema = z
  .object({
    kind: z.string().min(1),
    text: z.string().min(1),
    startIndex: z.number().int().min(0),
    endIndex: z.number().int().min(0),
    characterId: ChunkConversionCharacterIdSchema.nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!ensureEndIndexGreaterThanStart(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endIndex'],
        message: 'endIndex must be greater than startIndex',
      })
    }
  })

export const ChunkConversionDialogueTypeSchema = z.enum(['speech', 'thought'])

export const ChunkConversionDialogueSchema = z
  .object({
    type: ChunkConversionDialogueTypeSchema,
    speaker: z.union([ChunkConversionCharacterIdSchema, z.literal('不明')]),
    text: z.string().min(1),
  })
  .strict()

export const ChunkConversionPanelSchema = z
  .object({
    no: z.number().int().min(1),
    cut: z.string().min(1).max(200),
    camera: z.string().min(1),
    narration: z.array(z.string()).default([]),
    dialogue: z.array(ChunkConversionDialogueSchema).default([]),
    sfx: z.array(z.string()).default([]),
    importance: z.number().int().min(1).max(6),
  })
  .strict()

export const ChunkConversionMemorySchema = z
  .object({
    characters: z.array(ChunkConversionCharacterSchema),
    scenes: z.array(ChunkConversionSceneSchema),
  })
  .strict()

export const ChunkConversionSchema = z
  .object({
    version: z.literal('3'),
    memory: ChunkConversionMemorySchema,
    situations: z.array(ChunkConversionSituationSchema),
    summary: z.string().min(1).max(160),
    script: z.array(ChunkConversionPanelSchema).min(1),
  })
  .strict()

export type ChunkConversionMemory = z.infer<typeof ChunkConversionMemorySchema>
export type ChunkConversionCharacter = z.infer<typeof ChunkConversionCharacterSchema>
export type ChunkConversionScene = z.infer<typeof ChunkConversionSceneSchema>
export type ChunkConversionPossibleMatch = z.infer<typeof ChunkConversionPossibleMatchSchema>
export type ChunkConversionSituation = z.infer<typeof ChunkConversionSituationSchema>
export type ChunkConversionDialogue = z.infer<typeof ChunkConversionDialogueSchema>
export type ChunkConversionPanel = z.infer<typeof ChunkConversionPanelSchema>
export type ChunkConversionResult = z.infer<typeof ChunkConversionSchema>

export class ChunkConversionValidationError extends Data.TaggedError(
  'ChunkConversionValidationError',
)<{
  issues: z.ZodIssue[]
}> {}

export const validateChunkConversion = (
  input: unknown,
): Effect.Effect<ChunkConversionResult, ChunkConversionValidationError> =>
  Effect.try({
    try: () => {
      const parsed = ChunkConversionSchema.safeParse(input)
      if (!parsed.success) {
        throw parsed.error
      }
      return parsed.data
    },
    catch: (cause) =>
      new ChunkConversionValidationError({
        issues: cause instanceof z.ZodError ? cause.issues : [],
      }),
  })

export const formatChunkConversionIssues = (issues: z.ZodIssue[]): string =>
  issues
    .map((issue) => {
      const path = issue.path.join('.') || '(root)'
      return `${path}: ${issue.message}`
    })
    .join('\n')
