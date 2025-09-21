/**
 * Dialogue Speaker Resolution
 * LLM-assisted resolution for unknown speakers in dialogues
 */

import { Effect } from 'effect'
import { z } from 'zod'
import { defaultBaseUrl } from '@/agents/llm/base-url'
import { createLlmClient, type ProviderConfig as LlmProviderConfig } from '@/agents/llm/router'
import type { LlmClient } from '@/agents/llm/types'
import { JAPANESE_HONORIFICS } from '@/character/character.config'
import { getLLMProviderConfig } from '@/config/llm.config'
import { getLogger } from '@/infrastructure/logging/logger'
import {
  type CharacterId,
  type CharacterMemory,
  type CharacterMemoryIndex,
  type DialogueV2,
  type ExtractionV2,
  isUnknownSpeaker,
  type TempCharacterId,
} from '@/types/extractionV2'

/**
 * Speaker resolution context
 */
export interface SpeakerResolutionContext {
  text: string // Original chunk text
  dialogues: DialogueV2[]
  characterEvents: ExtractionV2['characterEvents']
  memoryIndex: CharacterMemoryIndex
  chunkIndex: number
}

/**
 * Resolution result for a dialogue
 */
export interface ResolutionResult {
  dialogueIndex: number
  originalSpeaker: string
  resolvedSpeaker: CharacterId | TempCharacterId | '不明'
  confidence: number
  method: 'explicit' | 'proximity' | 'verb_pattern' | 'context' | 'last_speaker' | 'unresolved'
}

export interface LlmProviderPreference {
  provider: 'gemini' | 'openai' | 'fake'
  model?: string
}

export interface ResolutionConfig {
  minConfidenceThreshold: number
  llm: {
    maxTokens: number
    providerPreferences: LlmProviderPreference[]
  }
  continuation: {
    maxCharacterGap: number
    forbidSentenceDelimiters: readonly string[]
    confidence: number
  }
}

const DEFAULT_MIN_CONFIDENCE_THRESHOLD = 0.6
const DEFAULT_LLM_CONFIDENCE = 0.4
const SPEAKER_ANALYSIS_MAX_TOKENS = 1_200
const CONTINUATION_SENTENCE_DELIMITERS = ['。', '？', '！'] as const
const CONTINUATION_MAX_GAP = 50
const CONTINUATION_CONFIDENCE = 0.5
const KNOWN_CHARACTER_LIMIT = 12

const DEFAULT_PROVIDER_PREFERENCES: readonly LlmProviderPreference[] = [
  { provider: 'gemini', model: 'gemini-2.5-flash-lite' },
  { provider: 'openai', model: 'gpt-5-nano' },
] as const

/**
 * Default configuration factory (creates fresh instances to avoid mutation leaks)
 */
export function getDefaultResolutionConfig(): ResolutionConfig {
  const providerPreferences =
    process.env.NODE_ENV === 'test'
      ? ([{ provider: 'fake' }] satisfies LlmProviderPreference[])
      : DEFAULT_PROVIDER_PREFERENCES.map((preference) => ({ ...preference }))

  return {
    minConfidenceThreshold: DEFAULT_MIN_CONFIDENCE_THRESHOLD,
    llm: {
      maxTokens: SPEAKER_ANALYSIS_MAX_TOKENS,
      providerPreferences,
    },
    continuation: {
      maxCharacterGap: CONTINUATION_MAX_GAP,
      forbidSentenceDelimiters: [...CONTINUATION_SENTENCE_DELIMITERS],
      confidence: CONTINUATION_CONFIDENCE,
    },
  }
}

export const SpeakerResolutionSchema = z.object({
  dialogues: z
    .array(
      z.object({
        dialogueIndex: z.number().int().min(0),
        speakerName: z
          .string()
          .trim()
          .min(1)
          .nullable()
          .optional(),
        speakerType: z.enum(['person', 'group', 'organization', 'location', 'unknown']),
        confidence: z.number().min(0).max(1).optional(),
        reasoning: z.string().optional(),
      }),
    ),
  namedEntities: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        type: z.enum(['person', 'location', 'organization', 'object', 'unknown']),
      }),
    ),
})

type SpeakerResolutionPayload = z.infer<typeof SpeakerResolutionSchema>
type LlmDialogueResolution = SpeakerResolutionPayload['dialogues'][number]

type SpeakerEntityType = LlmDialogueResolution['speakerType']

export class SpeakerResolutionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    // Avoid passing options to Error super to keep compatibility with targets
    // where Error constructor doesn't accept a second argument. Assign cause manually.
    super(message)
    if (options && 'cause' in options) {
      // Prefer non-enumerable property assignment when supported to mimic native Error.cause
      try {
        if (typeof Object.defineProperty === 'function') {
          Object.defineProperty(this, 'cause', {
            value: options.cause,
            enumerable: false,
            configurable: true,
            writable: false,
          })
        } else {
          ;(this as unknown as { cause?: unknown }).cause = options.cause
        }
      } catch {
        // fallback to direct assignment if defineProperty fails for some reason
        ;(this as unknown as { cause?: unknown }).cause = options.cause
      }
    }
    this.name = 'SpeakerResolutionError'
  }
}

/**
 * Main speaker resolution function (Effect-based)
 */
export function resolveSpeakersEffect(
  context: SpeakerResolutionContext,
  config: ResolutionConfig = getDefaultResolutionConfig(),
): Effect.Effect<ResolutionResult[], SpeakerResolutionError> {
  return Effect.gen(function* () {
    validateConfig(config)
    const prompts = buildSpeakerAnalysisPrompt(context)
    const llmResult = yield* runSpeakerResolutionLlmEffect(context, prompts, config)
    return mapLlmResultToResolutions(context, llmResult, config)
  })
}

/**
 * Promise wrapper around the Effect-based implementation
 */
export async function resolveSpeakers(
  context: SpeakerResolutionContext,
  config: ResolutionConfig = getDefaultResolutionConfig(),
): Promise<ResolutionResult[]> {
  return Effect.runPromise(resolveSpeakersEffect(context, config))
}

/**
 * Apply resolution results to extraction
 */
export function applyResolutions(
  extraction: ExtractionV2,
  resolutions: ResolutionResult[],
  minConfidence = DEFAULT_MIN_CONFIDENCE_THRESHOLD,
): ExtractionV2 {
  const resolvedDialogues = extraction.dialogues.map((dialogue, index) => {
    const resolution = resolutions.find((r) => r.dialogueIndex === index)

    if (
      resolution &&
      resolution.confidence >= minConfidence &&
      resolution.resolvedSpeaker !== '不明'
    ) {
      return {
        ...dialogue,
        speakerId: resolution.resolvedSpeaker,
      }
    }

    return dialogue
  })

  return {
    ...extraction,
    dialogues: resolvedDialogues,
  }
}

/**
 * Generate resolution statistics
 */
export function getResolutionStats(resolutions: ResolutionResult[]): {
  total: number
  resolved: number
  unresolved: number
  byMethod: Record<string, number>
  averageConfidence: number
} {
  const stats = {
    total: resolutions.length,
    resolved: 0,
    unresolved: 0,
    byMethod: {} as Record<string, number>,
    averageConfidence: 0,
  }

  let totalConfidence = 0

  for (const resolution of resolutions) {
    if (resolution.resolvedSpeaker !== '不明' && resolution.method !== 'explicit') {
      stats.resolved++
    } else if (resolution.method === 'unresolved') {
      stats.unresolved++
    }

    stats.byMethod[resolution.method] = (stats.byMethod[resolution.method] || 0) + 1
    totalConfidence += resolution.confidence
  }

  stats.averageConfidence = stats.total > 0 ? totalConfidence / stats.total : 0

  return stats
}

interface SpeakerAnalysisPrompt {
  systemPrompt: string
  userPrompt: string
}

function buildSpeakerAnalysisPrompt(context: SpeakerResolutionContext): SpeakerAnalysisPrompt {
  const knownCharacters = formatKnownCharacters(context.memoryIndex)
  const dialogueLines = context.dialogues
    .map(
      (dialogue, index) =>
        `- index: ${index}\n  offset: ${dialogue.index}\n  text: ${dialogue.text.replace(/\n/g, ' ')}`,
    )
    .join('\n')

  const systemPrompt = [
    'あなたは日本語の小説テキストから固有名詞を抽出し、会話の話者を推論する専門家です。',
    '出力は必ず指定された JSON スキーマに従ってください。',
    '会話で発話している人物が誰なのか、場所名や組織名などの固有名詞も合わせて整理します。',
  ].join('\n')

  const userPromptSections = [
    '## 本文',
    context.text.trim(),
    '',
    '## 既知の登場人物候補 (ID: 名前・別名)',
    knownCharacters || 'なし',
    '',
    '## 会話一覧',
    dialogueLines || '会話は存在しません',
    '',
    '## 指示',
    [
      '1. 会話ごとに最も自然な話者名を推定し、人物以外の場合は種類を明示してください。',
      '2. 特定できない場合は speakerName を null にし、confidence は 0.0 にしてください。',
      '3. namedEntities には本文から抽出した登場人物名・場所名・組織名を重複なく列挙してください。',
      '4. confidence は 0.0 から 1.0 の範囲で、判断根拠の確からしさを示してください。',
      '5. speakerName に敬称が含まれる場合でも、そのまま記載してください。',
    ].join('\n'),
  ]

  return {
    systemPrompt,
    userPrompt: userPromptSections.join('\n'),
  }
}

function formatKnownCharacters(memoryIndex: CharacterMemoryIndex): string {
  const entries: CharacterMemory[] = Array.from(memoryIndex.values())
  if (entries.length === 0) return ''

  const sorted = entries
    .slice()
    .sort((a, b) => b.lastSeenChunk - a.lastSeenChunk)
    .slice(0, KNOWN_CHARACTER_LIMIT)

  return sorted
    .map((memory) => {
      const names = Array.from(memory.names)
      const primaryName = names[0] ?? memory.id
      const aliases = names.slice(1).join(' / ')
      return aliases ? `${memory.id}: ${primaryName} / ${aliases}` : `${memory.id}: ${primaryName}`
    })
    .join('\n')
}

function runSpeakerResolutionLlmEffect(
  context: SpeakerResolutionContext,
  prompts: SpeakerAnalysisPrompt,
  config: ResolutionConfig,
): Effect.Effect<SpeakerResolutionPayload, SpeakerResolutionError> {
  const logger = getLogger().withContext({
    service: 'speaker-resolution',
    chunkIndex: context.chunkIndex,
  })

  return Effect.gen(function* () {
    if (config.llm.providerPreferences.length === 0) {
      throw new SpeakerResolutionError('No LLM providers configured for speaker resolution')
    }

    let lastError: SpeakerResolutionError | null = null

    for (const preference of config.llm.providerPreferences) {
      try {
        const client = yield* instantiateClientEffect(preference)
        logger.info('Attempting speaker resolution via LLM', {
          provider: client.provider,
          model: preference.model,
        })

        const raw = yield* Effect.tryPromise({
          try: () =>
            client.generateStructured<SpeakerResolutionPayload>({
              systemPrompt: prompts.systemPrompt,
              userPrompt: prompts.userPrompt,
              spec: {
                schema: SpeakerResolutionSchema,
                schemaName: 'SpeakerResolutionResult',
              },
              options: { maxTokens: config.llm.maxTokens },
              telemetry: {
                agentName: 'speaker-resolution',
                chunkIndex: context.chunkIndex,
              },
            }),
          catch: (error) =>
            new SpeakerResolutionError(
              `LLM generation failed for provider ${client.provider}`,
              { cause: error },
            ),
        })

        const parsed = SpeakerResolutionSchema.safeParse(raw)
        if (!parsed.success) {
          throw new SpeakerResolutionError(
            `LLM response schema mismatch for provider ${client.provider}`,
            { cause: parsed.error },
          )
        }

        if (parsed.data.namedEntities.length > 0) {
          logger.debug('Named entities extracted', {
            entities: parsed.data.namedEntities.map((entity) => ({
              name: entity.name,
              type: entity.type,
            })),
          })
        }

        return parsed.data
      } catch (error) {
        const resolutionError =
          error instanceof SpeakerResolutionError
            ? error
            : new SpeakerResolutionError('Unexpected error during speaker resolution', {
                cause: error,
              })
        lastError = resolutionError
        logger.warn('Speaker resolution provider attempt failed', {
          provider: preference.provider,
          model: preference.model,
          error: resolutionError.message,
        })
      }
    }

    throw lastError ??
      new SpeakerResolutionError('All configured LLM providers failed for speaker resolution')
  })
}

function instantiateClientEffect(
  preference: LlmProviderPreference,
): Effect.Effect<LlmClient, SpeakerResolutionError> {
  return Effect.try({
    try: () => instantiateClient(preference),
    catch: (error) =>
      new SpeakerResolutionError(
        `Failed to initialize client for provider ${preference.provider}`,
        { cause: error },
      ),
  })
}

function instantiateClient(preference: LlmProviderPreference): LlmClient {
  if (preference.provider === 'fake') return createLlmClient({ provider: 'fake' })

  if (preference.provider === 'gemini') {
    const cfg = getLLMProviderConfig('gemini')
    if (!cfg.vertexai) throw new Error('Gemini provider requires Vertex AI configuration')
    const { project, location, serviceAccountPath } = cfg.vertexai
    if (!project || !location) throw new Error('Vertex AI configuration must include project and location')
    return createLlmClient({
      provider: 'gemini',
      model: preference.model ?? cfg.model,
      project,
      location,
      serviceAccountPath,
    } as LlmProviderConfig)
  }

  if (preference.provider === 'openai') {
    const cfg = getLLMProviderConfig('openai')
    if (!cfg.apiKey) throw new Error('OpenAI provider requires an API key for speaker resolution')
    const model = preference.model ?? cfg.model
    return createLlmClient({
      provider: 'openai',
      apiKey: cfg.apiKey,
      model,
      baseUrl: cfg.baseUrl ?? defaultBaseUrl('openai'),
    } as LlmProviderConfig)
  }

  throw new Error(`Unsupported provider preference: ${preference.provider}`)
}

function mapLlmResultToResolutions(
  context: SpeakerResolutionContext,
  llmResult: SpeakerResolutionPayload,
  config: ResolutionConfig,
): ResolutionResult[] {
  const dialogueMap = new Map<number, LlmDialogueResolution>()
  for (const item of llmResult.dialogues) {
    if (Number.isInteger(item.dialogueIndex) && item.dialogueIndex >= 0) {
      dialogueMap.set(item.dialogueIndex, item)
    }
  }

  const results: ResolutionResult[] = []
  let lastResolvedSpeaker: CharacterId | TempCharacterId | null = null

  for (let i = 0; i < context.dialogues.length; i++) {
    const dialogue = context.dialogues[i]

    if (!isUnknownSpeaker(dialogue.speakerId)) {
      results.push({
        dialogueIndex: i,
        originalSpeaker: dialogue.speakerId,
        resolvedSpeaker: dialogue.speakerId,
        confidence: 1,
        method: 'explicit',
      })
      lastResolvedSpeaker = dialogue.speakerId
      continue
    }

    const llmCandidate = dialogueMap.get(i)
    const candidateSpeakerName = normalizeCandidateName(llmCandidate?.speakerName)
    const candidateType = llmCandidate?.speakerType ?? 'unknown'
    const candidateConfidence = clampConfidence(llmCandidate?.confidence)

    if (candidateSpeakerName && isResolvableSpeakerType(candidateType)) {
      const matchedId = findCharacterByName(candidateSpeakerName, context.memoryIndex)
      if (matchedId && candidateConfidence >= config.minConfidenceThreshold) {
        results.push({
          dialogueIndex: i,
          originalSpeaker: dialogue.speakerId,
          resolvedSpeaker: matchedId,
          confidence: candidateConfidence,
          method: 'context',
        })
        lastResolvedSpeaker = matchedId
        continue
      }
    }

    if (
      lastResolvedSpeaker &&
      shouldInheritLastSpeaker(context, i, config.continuation)
    ) {
      results.push({
        dialogueIndex: i,
        originalSpeaker: dialogue.speakerId,
        resolvedSpeaker: lastResolvedSpeaker,
        confidence: config.continuation.confidence,
        method: 'last_speaker',
      })
      continue
    }

    results.push({
      dialogueIndex: i,
      originalSpeaker: dialogue.speakerId,
      resolvedSpeaker: '不明',
      confidence: 0,
      method: 'unresolved',
    })
  }

  return results
}

function shouldInheritLastSpeaker(
  context: SpeakerResolutionContext,
  index: number,
  continuation: ResolutionConfig['continuation'],
): boolean {
  if (index === 0) return false
  const prevDialogue = context.dialogues[index - 1]
  const currentDialogue = context.dialogues[index]
  const gapText = context.text.substring(prevDialogue.index, currentDialogue.index)
  if (gapText.length > continuation.maxCharacterGap) {
    return false
  }
  return !continuation.forbidSentenceDelimiters.some((delimiter) => gapText.includes(delimiter))
}

function normalizeCandidateName(name: string | null | undefined): string | null {
  if (!name) return null
  let normalized = name.trim()
  for (const honorific of JAPANESE_HONORIFICS) {
    if (normalized.endsWith(honorific)) {
      normalized = normalized.slice(0, -honorific.length)
      break
    }
  }
  return normalized.trim() || null
}

function clampConfidence(confidence: number | undefined): number {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return DEFAULT_LLM_CONFIDENCE
  }
  return Math.min(1, Math.max(0, confidence))
}

function isResolvableSpeakerType(type: SpeakerEntityType): boolean {
  return type === 'person' || type === 'group' || type === 'organization'
}

function findCharacterByName(
  name: string,
  memoryIndex: CharacterMemoryIndex,
): CharacterId | null {
  const normalizedName = name.toLowerCase().trim()
  if (!normalizedName) return null

  for (const [id, memory] of memoryIndex) {
    for (const memName of memory.names) {
      const normalizedMemoryName = memName.toLowerCase().trim()
      if (
        normalizedMemoryName &&
        (normalizedMemoryName.includes(normalizedName) ||
          normalizedName.includes(normalizedMemoryName))
      ) {
        return id
      }
    }
  }

  return null
}

function validateConfig(config: ResolutionConfig): void {
  if (config.llm.maxTokens <= 0) {
    throw new SpeakerResolutionError('llm.maxTokens must be a positive number')
  }
  if (config.llm.providerPreferences.length === 0) {
    throw new SpeakerResolutionError('At least one LLM provider must be configured')
  }
  if (config.continuation.maxCharacterGap < 0) {
    throw new SpeakerResolutionError('continuation.maxCharacterGap must be non-negative')
  }
}
