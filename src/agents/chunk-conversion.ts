import { Data, Effect } from 'effect'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getChunkConversionConfig } from '@/config'
import { getLogger } from '@/infrastructure/logging/logger'
import {
  type ChunkConversionResult,
  ChunkConversionSchema,
} from '@/types/chunk-conversion'

export interface ChunkConversionInput {
  /** 対象チャンク本文 */
  chunkText: string
  /** 0起点のチャンクインデックス */
  chunkIndex: number
  /** 全チャンク数 */
  chunksNumber: number
  /** 直前までの要素メモリ(JSON文字列) */
  previousElementMemoryJson?: string
  /** 前チャンクの要約 */
  previousChunkSummary?: string
  /** 次チャンクの要約 */
  nextChunkSummary?: string
}

export interface ChunkConversionOptions {
  jobId?: string
}

export interface ChunkConversionInvocationResult {
  result: ChunkConversionResult
  provider: string
}

export class ChunkConversionAgentError extends Data.TaggedError('ChunkConversionAgentError')<{
  reason: string
  cause?: unknown
}> {}

const EMPTY_MEMORY_JSON = '{"characters":[],"scenes":[]}'

function ensureValidInput(input: ChunkConversionInput) {
  if (!Number.isFinite(input.chunkIndex) || input.chunkIndex < 0) {
    throw new ChunkConversionAgentError({
      reason: `chunkIndex must be a non-negative integer (received ${input.chunkIndex})`,
    })
  }
  if (!Number.isFinite(input.chunksNumber) || input.chunksNumber <= 0) {
    throw new ChunkConversionAgentError({
      reason: `chunksNumber must be a positive integer (received ${input.chunksNumber})`,
    })
  }
  if (input.chunkIndex >= input.chunksNumber) {
    throw new ChunkConversionAgentError({
      reason: `chunkIndex ${input.chunkIndex} is out of range for chunksNumber ${input.chunksNumber}`,
    })
  }
  const text = input.chunkText?.trim()
  if (!text) {
    throw new ChunkConversionAgentError({ reason: 'chunkText is required and cannot be empty' })
  }
}

function resolveTemplateValue(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  const trimmed = raw.trim()
  return trimmed.length > 0 ? raw : fallback
}

function applyTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template,
  )
}

export const chunkConversionEffect = (
  input: ChunkConversionInput,
  options: ChunkConversionOptions = {},
): Effect.Effect<ChunkConversionInvocationResult, ChunkConversionAgentError> => {
  const logger = getLogger().withContext({ agent: 'chunk-conversion' })

  return Effect.gen(function* () {
    ensureValidInput(input)

    const config = getChunkConversionConfig()
    const sanitizedText = input.chunkText.trim()
    const replacements = {
      chunkIndex: String(input.chunkIndex),
      chunksNumber: String(input.chunksNumber),
      previousElementMemoryJson: resolveTemplateValue(
        input.previousElementMemoryJson,
        EMPTY_MEMORY_JSON,
      ),
      previousChunkSummary: resolveTemplateValue(input.previousChunkSummary, ''),
      chunkText: sanitizedText,
      nextChunkSummary: resolveTemplateValue(input.nextChunkSummary, ''),
    }

    const systemPrompt = applyTemplate(config.systemPrompt, replacements)
    const userPrompt = applyTemplate(config.userPromptTemplate, replacements)

    const generator = new DefaultLlmStructuredGenerator([config.provider])

    yield* Effect.sync(() =>
      logger.info('Executing chunk conversion', {
        chunkIndex: input.chunkIndex,
        provider: config.provider,
        chunkLength: sanitizedText.length,
      }),
    )

    const result = yield* Effect.tryPromise({
      try: () =>
        generator.generateObjectWithFallback({
          name: 'chunk-conversion',
          systemPrompt,
          userPrompt,
          schema: ChunkConversionSchema,
          schemaName: 'ChunkConversion',
          telemetry: {
            jobId: options.jobId,
            chunkIndex: input.chunkIndex,
            stepName: 'chunkConversion',
          },
        }),
      catch: (cause) =>
        new ChunkConversionAgentError({
          reason: 'Failed to generate chunk conversion result',
          cause,
        }),
    })

    // Normalize to satisfy strict typing (ensure required arrays exist)
    const normalized: ChunkConversionResult = {
      ...result,
      memory: {
        characters: (result.memory?.characters ?? []).map((c) => ({
          ...c,
          aliases: c.aliases ?? [],
          possibleMatchIds: c.possibleMatchIds ?? [],
        })),
        scenes: (result.memory?.scenes ?? []).map((s) => ({ ...s })),
      },
      situations: (result.situations ?? []).map((s) => ({ ...s })),
      script: result.script.map((p) => ({
        ...p,
        dialogue: (p.dialogue ?? []).map((d) => ({ ...d })),
        narration: p.narration ?? [],
        sfx: p.sfx ?? [],
      })),
    }

    yield* Effect.sync(() =>
      logger.info('Chunk conversion completed', {
        chunkIndex: input.chunkIndex,
        provider: config.provider,
        panelCount: normalized.script.length,
      }),
    )

    return {
      result: normalized,
      provider: config.provider,
    }
  })
}

export async function runChunkConversion(
  input: ChunkConversionInput,
  options?: ChunkConversionOptions,
): Promise<ChunkConversionInvocationResult> {
  return Effect.runPromise(chunkConversionEffect(input, options ?? {}))
}
