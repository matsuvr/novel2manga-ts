/**
 * V2 Extraction Pipeline
 * Main pipeline for character-stateful chunk processing
 */

import { existsSync, mkdirSync } from 'node:fs'
import { generateCastList, generateCastSummary } from '@/character/finalize'
import {
  getDefaultStoragePaths,
  loadCharacterMemory,
  loadChunkCache,
  loadPromptMemory,
  type StoragePaths,
  saveCharacterMemory,
  saveChunkCache,
  savePromptMemory,
} from '@/character/persistence'
import { buildIdMapping, recordEvents, summarizeMemory } from '@/character/state'
import { getAppConfig, getCharacterMemoryConfig } from '@/config'
import {
  generateExtractionV2UserPrompt,
  getExtractionV2SystemPrompt,
  migrateOldExtractionToV2,
} from '@/prompts/extractionV2'
import type { AliasIndex, CharacterMemoryIndex, ExtractionV2 } from '@/types/extractionV2'
import { isTempCharacterId } from '@/types/extractionV2'
import {
  formatValidationErrors,
  type ValidatedExtractionV2,
  validateExtraction,
  validateIndices,
} from '@/validation/extractionV2'

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  dataDir?: string
  cacheDir?: string
  enableCache?: boolean
  enableV2Migration?: boolean // Support old format migration
  maxRetries?: number
  logLevel?: 'error' | 'warn' | 'info' | 'debug'
}

/**
 * Pipeline context
 */
export interface PipelineContext {
  jobId: string
  novelId: string
  chunks: string[]
  memoryIndex: CharacterMemoryIndex
  aliasIndex: AliasIndex
  storagePaths: StoragePaths
  nextIdCounter: number
  config: PipelineConfig
}

/**
 * Logger interface
 */
interface Logger {
  error(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  info(message: string, data?: unknown): void
  debug(message: string, data?: unknown): void
}

/**
 * Simple console logger
 */
class ConsoleLogger implements Logger {
  constructor(private level: 'error' | 'warn' | 'info' | 'debug') {}

  private shouldLog(level: 'error' | 'warn' | 'info' | 'debug'): boolean {
    const levels = ['error', 'warn', 'info', 'debug']
    return levels.indexOf(level) <= levels.indexOf(this.level)
  }

  error(message: string, data?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, data || '')
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, data || '')
    }
  }

  info(message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, data || '')
    }
  }

  debug(message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, data || '')
    }
  }
}

/**
 * Initialize pipeline context
 */
export async function initializePipeline(
  jobId: string,
  novelId: string,
  chunks: string[],
  config: PipelineConfig = {},
): Promise<PipelineContext> {
  const dataDir = config.dataDir || './data'
  const storagePaths = getDefaultStoragePaths(dataDir)

  // Ensure directories exist
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  if (config.cacheDir && !existsSync(config.cacheDir)) {
    mkdirSync(config.cacheDir, { recursive: true })
  }

  // Load existing character memory
  const { memoryIndex, aliasIndex } = await loadCharacterMemory(storagePaths)

  // Determine next ID counter
  let nextIdCounter = 1
  for (const id of memoryIndex.keys()) {
    const match = id.match(/^char_(\d+)$/)
    if (match) {
      nextIdCounter = Math.max(nextIdCounter, parseInt(match[1]) + 1)
    }
  }

  return {
    jobId,
    novelId,
    chunks,
    memoryIndex,
    aliasIndex,
    storagePaths,
    nextIdCounter,
    config,
  }
}

/**
 * Process a single chunk with V2 extraction
 */
export async function processChunkV2(
  chunkIndex: number,
  context: PipelineContext,
  llmClient: (systemPrompt: string, userPrompt: string) => Promise<string>,
  logger: Logger,
): Promise<ExtractionV2 | null> {
  const { chunks, config } = context

  // Check cache first
  if (config.enableCache && config.cacheDir) {
    const cached = await loadChunkCache(chunkIndex, config.cacheDir)
    if (cached) {
      logger.debug(`Using cached extraction for chunk ${chunkIndex}`)

      // Validate cached data
      const validation = validateExtraction(cached)
      if (validation.success) {
        return validation.data
      } else {
        logger.warn(`Cached extraction invalid for chunk ${chunkIndex}, regenerating`)
      }
    }
  }

  // Get chunk text and context
  const chunkText = chunks[chunkIndex]
  const previousChunkText = chunkIndex > 0 ? chunks[chunkIndex - 1] : ''
  const nextChunkText = chunkIndex < chunks.length - 1 ? chunks[chunkIndex + 1] : ''

  // Load prompt memory
  const promptMemory = await loadPromptMemory(context.storagePaths)

  // Generate prompts
  const systemPrompt = getExtractionV2SystemPrompt()
  const userPrompt = generateExtractionV2UserPrompt(
    chunkIndex,
    chunkText,
    previousChunkText,
    nextChunkText,
    promptMemory,
  )

  // Call LLM
  let retries = 0
  const maxRetries = config.maxRetries ?? getAppConfig().processing.retry.maxAttempts

  while (retries < maxRetries) {
    try {
      logger.info(`Processing chunk ${chunkIndex} (attempt ${retries + 1}/${maxRetries})`)

      const response = await llmClient(systemPrompt, userPrompt)

      // Parse JSON response
      let parsed: unknown
      try {
        // Remove any markdown code blocks if present
        const cleanedResponse = response
          .replace(/```json\n?/gi, '')
          .replace(/```\n?/gi, '')
          .trim()
        parsed = JSON.parse(cleanedResponse) as unknown
      } catch (parseError) {
        logger.error(`Failed to parse LLM response for chunk ${chunkIndex}`, parseError)
        retries++
        continue
      }

      // Validate extraction
      const validation = validateExtraction(parsed)
      if (!validation.success) {
        logger.error(
          `Validation failed for chunk ${chunkIndex}`,
          formatValidationErrors(validation.error),
        )

        // If migration is enabled and this looks like old format, try migration
        if (
          config.enableV2Migration &&
          typeof parsed === 'object' &&
          parsed !== null &&
          !('characterEvents' in (parsed as Record<string, unknown>))
        ) {
          logger.info(`Attempting migration from old format for chunk ${chunkIndex}`)
          const migrated = migrateOldExtractionToV2(parsed as Record<string, unknown>, chunkIndex)
          const migrationValidation = validateExtraction(migrated as unknown)

          if (migrationValidation.success) {
            logger.info(`Successfully migrated chunk ${chunkIndex} to V2 format`)
            parsed = migrationValidation.data
          } else {
            retries++
            continue
          }
        } else {
          retries++
          continue
        }
      } else {
        parsed = validation.data
      }

      // Validate indices
      const indexValidation = validateIndices(parsed as ValidatedExtractionV2, chunkText.length)
      if (!indexValidation.valid) {
        logger.warn(`Index validation warnings for chunk ${chunkIndex}`, indexValidation.errors)
        // Continue with extraction despite index issues
      }

      // Cache the extraction
      if (config.enableCache && config.cacheDir) {
        await saveChunkCache(chunkIndex, parsed, config.cacheDir)
      }

      return parsed as ExtractionV2
    } catch (error) {
      logger.error(`Failed to process chunk ${chunkIndex}`, error)
      retries++

      if (retries >= maxRetries) {
        logger.error(`Max retries reached for chunk ${chunkIndex}, skipping`)
        return null
      }
    }
  }

  return null
}

/**
 * Update character memory with extraction results
 */
export function updateCharacterMemory(
  extraction: ExtractionV2,
  chunkIndex: number,
  context: PipelineContext,
  logger: Logger,
): void {
  const { memoryIndex, aliasIndex } = context

  // Build temp to stable ID mapping
  const idMapping = buildIdMapping(
    extraction.characters,
    memoryIndex,
    aliasIndex,
    chunkIndex,
    () => context.nextIdCounter++,
  )

  logger.debug(`Chunk ${chunkIndex}: Mapped ${idMapping.size} temp IDs to stable IDs`)

  // Rewrite IDs in character events
  const rewrittenEvents = extraction.characterEvents.map((event) => {
    if (isTempCharacterId(event.characterId)) {
      const mapped = idMapping.get(event.characterId)
      return { ...event, characterId: mapped ?? event.characterId }
    }
    return event
  }) as typeof extraction.characterEvents

  // Rewrite IDs in dialogues
  const rewrittenDialogues = extraction.dialogues.map((dialogue) => {
    if (isTempCharacterId(dialogue.speakerId)) {
      const mapped = idMapping.get(dialogue.speakerId)
      return { ...dialogue, speakerId: mapped ?? dialogue.speakerId }
    }
    return dialogue
  }) as typeof extraction.dialogues

  // Record events in memory
  recordEvents(memoryIndex, rewrittenEvents, chunkIndex, idMapping)

  // Summarize memory for characters that have grown too large
  const { summaryMaxLength } = getCharacterMemoryConfig()
  for (const [characterId, memory] of memoryIndex) {
    if (memory.summary.length > summaryMaxLength) {
      summarizeMemory(memoryIndex, characterId, summaryMaxLength)
      logger.debug(`Summarized memory for character ${characterId}`)
    }
  }

  // Update extraction with rewritten IDs
  extraction.characterEvents = rewrittenEvents
  extraction.dialogues = rewrittenDialogues
}

/**
 * Run the complete V2 extraction pipeline
 */
export async function runExtractionPipeline(
  jobId: string,
  novelId: string,
  chunks: string[],
  llmClient: (systemPrompt: string, userPrompt: string) => Promise<string>,
  config: PipelineConfig = {},
): Promise<{
  extractions: (ExtractionV2 | null)[]
  castList: ReturnType<typeof generateCastList>
  summary: string
}> {
  const logger = new ConsoleLogger(config.logLevel || 'info')

  logger.info(`Starting V2 extraction pipeline for job ${jobId}, novel ${novelId}`)
  logger.info(`Processing ${chunks.length} chunks`)

  // Initialize context
  const context = await initializePipeline(jobId, novelId, chunks, config)
  logger.info(`Loaded ${context.memoryIndex.size} existing characters`)

  const extractions: (ExtractionV2 | null)[] = []

  // Process chunks sequentially (to maintain character continuity)
  for (let i = 0; i < chunks.length; i++) {
    const extraction = await processChunkV2(i, context, llmClient, logger)

    if (extraction) {
      // Update character memory
      updateCharacterMemory(extraction, i, context, logger)

      // Save memory after each chunk
      await saveCharacterMemory(context.memoryIndex, context.storagePaths)
      await savePromptMemory(context.memoryIndex, context.storagePaths, {
        currentChunk: i,
      })

      logger.info(
        `Chunk ${i}: Extracted ${extraction.characters.length} characters, ` +
          `${extraction.characterEvents.length} events, ` +
          `${extraction.dialogues.length} dialogues`,
      )
    }

    extractions.push(extraction)
  }

  // Generate final cast list
  const castList = generateCastList(context.memoryIndex)
  const summary = generateCastSummary(castList)

  logger.info(`Pipeline complete: ${castList.length} total characters`)
  logger.info(summary)

  return {
    extractions,
    castList,
    summary,
  }
}

/**
 * Export pipeline components for testing
 */
export { ConsoleLogger, type Logger }
