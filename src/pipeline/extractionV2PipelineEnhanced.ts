/**
 * V2 Extraction Pipeline with Enhanced Features
 * Integrated speaker resolution and enhanced logging
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
import { saveCharacterSnapshot } from '@/character/snapshot'
import {
  applyResolutions,
  getResolutionStats,
  type ResolutionConfig,
  resolveSpeakers,
  type SpeakerResolutionContext,
} from '@/character/speaker-resolution'
import {
  buildIdMapping,
  createAliasIndex,
  createCharacterMemoryIndex,
  recordEvents,
  summarizeMemory,
} from '@/character/state'
import { getCharacterMemoryConfig } from '@/config'
import {
  createLogger,
  type EnhancedLogger,
  ExtractionErrorHandler,
  type ExtractionMetrics,
  type LogContext,
  LogLevel,
  PerformanceTracker,
} from '@/logging/enhanced-logger'
import { generateExtractionV2UserPrompt, getExtractionV2SystemPrompt } from '@/prompts/extractionV2'
import type { AliasIndex, CharacterMemoryIndex, ExtractionV2 } from '@/types/extractionV2'
import { isCharacterId, isTempCharacterId } from '@/types/extractionV2'
import {
  formatValidationErrors,
  validateExtraction,
  validateIndices,
} from '@/validation/extractionV2'

/**
 * Enhanced pipeline configuration
 */
export interface EnhancedPipelineConfig {
  dataDir?: string
  cacheDir?: string
  logDir?: string
  enableCache?: boolean
  enableSpeakerResolution?: boolean
  speakerResolutionConfig?: ResolutionConfig
  maxRetries?: number
  logLevel?: LogLevel
  enableMetrics?: boolean
  enableCharacterTracking?: boolean
}

/**
 * Enhanced pipeline context
 */
export interface EnhancedPipelineContext {
  jobId: string
  novelId: string
  chunks: string[]
  memoryIndex: CharacterMemoryIndex
  aliasIndex: AliasIndex
  storagePaths: StoragePaths
  nextIdCounter: number
  config: EnhancedPipelineConfig
  logger: EnhancedLogger
  errorHandler: ExtractionErrorHandler
  performanceTracker: PerformanceTracker
}

/**
 * Initialize enhanced pipeline context
 */
export async function initializeEnhancedPipeline(
  jobId: string,
  novelId: string,
  chunks: string[],
  config: EnhancedPipelineConfig = {},
): Promise<EnhancedPipelineContext> {
  const dataDir = config.dataDir || './data'
  const storagePaths = getDefaultStoragePaths(dataDir)

  // Ensure directories exist
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  if (config.cacheDir && !existsSync(config.cacheDir)) {
    mkdirSync(config.cacheDir, { recursive: true })
  }

  // Initialize logger
  const logger = createLogger(config.logLevel || LogLevel.INFO, config.logDir)

  logger.info('Pipeline', 'Initializing V2 extraction pipeline', {
    jobId,
    novelId,
    chunks: chunks.length,
  })

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

  logger.info('Pipeline', 'Character memory loaded', {
    existingCharacters: memoryIndex.size,
    nextIdCounter,
  })

  // Initialize error handler and performance tracker
  const errorHandler = new ExtractionErrorHandler(logger, config.maxRetries || 3)
  const performanceTracker = new PerformanceTracker(logger)

  return {
    jobId,
    novelId,
    chunks,
    memoryIndex,
    aliasIndex,
    storagePaths,
    nextIdCounter,
    config,
    logger,
    errorHandler,
    performanceTracker,
  }
}

/**
 * Process a single chunk with enhanced features
 */
export async function processChunkEnhanced(
  chunkIndex: number,
  context: EnhancedPipelineContext,
  llmClient: (systemPrompt: string, userPrompt: string) => Promise<string>,
): Promise<ExtractionV2 | null> {
  const { chunks, memoryIndex, aliasIndex, config, logger, errorHandler, performanceTracker } =
    context
  const logContext: LogContext = {
    jobId: context.jobId,
    chunkIndex,
  }

  const startTime = Date.now()
  let errors = 0

  logger.info('Chunk', `Starting chunk ${chunkIndex} processing`, null, logContext)

  // Check cache first
  if (config.enableCache && config.cacheDir) {
    const cached = await loadChunkCache(chunkIndex, config.cacheDir)
    if (cached) {
      logger.debug('Cache', 'Using cached extraction', null, logContext)

      const validation = validateExtraction(cached)
      if (validation.success) {
        return validation.data
      } else {
        logger.warn(
          'Cache',
          'Cached extraction invalid, regenerating',
          formatValidationErrors(validation.error),
          logContext,
        )
      }
    }
  }

  // Get chunk text and context
  const chunkText = chunks[chunkIndex]
  const previousChunkText = chunkIndex > 0 ? chunks[chunkIndex - 1] : ''
  const nextChunkText = chunkIndex < chunks.length - 1 ? chunks[chunkIndex + 1] : ''

  // Load prompt memory
  const promptMemory = await performanceTracker.measureAsync(
    'LoadPromptMemory',
    () => loadPromptMemory(context.storagePaths),
    logContext,
  )

  // Generate prompts
  const systemPrompt = getExtractionV2SystemPrompt()
  const userPrompt = generateExtractionV2UserPrompt(
    chunkIndex,
    chunkText,
    previousChunkText,
    nextChunkText,
    promptMemory,
  )

  // Call LLM with error handling
  const extraction = await errorHandler.handleExtractionError(
    async () => {
      logger.debug('LLM', 'Calling LLM for extraction', null, logContext)

      const response = await performanceTracker.measureAsync(
        'LLMCall',
        () => llmClient(systemPrompt, userPrompt),
        logContext,
      )

      // Parse JSON response
      const cleanedResponse = response
        .replace(/```json\n?/gi, '')
        .replace(/```\n?/gi, '')
        .trim()

      const parsed = JSON.parse(cleanedResponse)

      // Validate extraction
      const validation = validateExtraction(parsed)
      if (!validation.success) {
        throw new Error(`Validation failed: ${formatValidationErrors(validation.error)}`)
      }

      return validation.data
    },
    logContext,
    `Failed to extract chunk ${chunkIndex}`,
  )

  if (!extraction) {
    errors++
    logger.error('Extraction', 'Failed to extract chunk after retries', null, logContext)
    return null
  }

  // Validate indices
  const indexValidation = validateIndices(extraction, chunkText.length)
  if (!indexValidation.valid) {
    logger.warn('Validation', 'Index validation warnings', indexValidation.errors, logContext)
  }

  // Apply speaker resolution if enabled
  if (config.enableSpeakerResolution) {
    logger.debug('SpeakerResolution', 'Starting speaker resolution', null, logContext)

    const resolutionContext: SpeakerResolutionContext = {
      text: chunkText,
      dialogues: extraction.dialogues,
      characterEvents: extraction.characterEvents,
      memoryIndex,
      chunkIndex,
    }

    const resolutions = performanceTracker.measure(
      'SpeakerResolution',
      () => resolveSpeakers(resolutionContext, config.speakerResolutionConfig),
      logContext,
    )

    const stats = getResolutionStats(resolutions)
    logger.info('SpeakerResolution', 'Resolution complete', stats, logContext)

    // Apply resolutions to extraction
    const resolvedExtraction = applyResolutions(extraction, resolutions)
    extraction.dialogues = resolvedExtraction.dialogues
  }

  // Update character memory
  performanceTracker.measure(
    'UpdateMemory',
    () => {
      // Build ID mapping
      const idMapping = buildIdMapping(
        extraction.characters,
        memoryIndex,
        aliasIndex,
        chunkIndex,
        () => context.nextIdCounter++,
      )

      // Log character operations
      for (const [tempId, stableId] of idMapping) {
        logger.logCharacterOperation({
          timestamp: new Date().toISOString(),
          operation: 'merge',
          tempId,
          stableId,
          details: { chunkIndex },
        })
      }

      // Log new characters
      for (const char of extraction.characters) {
        if (isCharacterId(char.id)) {
          logger.logCharacterOperation({
            timestamp: new Date().toISOString(),
            operation: 'create',
            stableId: char.id,
            details: {
              name: char.name,
              chunkIndex,
            },
          })
        }
      }

      // Rewrite IDs
      extraction.characterEvents = extraction.characterEvents.map((event) => {
        if (isTempCharacterId(event.characterId)) {
          const mapped = idMapping.get(event.characterId)
          return { ...event, characterId: mapped ?? event.characterId }
        }
        return event
      })

      extraction.dialogues = extraction.dialogues.map((dialogue) => {
        if (isTempCharacterId(dialogue.speakerId)) {
          const mapped = idMapping.get(dialogue.speakerId)
          return { ...dialogue, speakerId: mapped ?? dialogue.speakerId }
        }
        return dialogue
      })

      // Record events
      recordEvents(memoryIndex, extraction.characterEvents, chunkIndex, idMapping)

      // Summarize large memories
      const { summaryMaxLength } = getCharacterMemoryConfig()
      for (const [characterId, memory] of memoryIndex) {
        if (memory.summary && memory.summary.length > summaryMaxLength) {
          summarizeMemory(memoryIndex, characterId, summaryMaxLength)
          logger.debug('Memory', `Summarized memory for ${characterId}`, null, { characterId })
        }
      }
    },
    logContext,
  )

  // Cache the extraction
  if (config.enableCache && config.cacheDir) {
    await saveChunkCache(chunkIndex, extraction, config.cacheDir)
  }

  // Log metrics
  const processingTime = Date.now() - startTime
  const metrics: ExtractionMetrics = {
    chunkIndex,
    processingTime,
    charactersFound: extraction.characters.length,
    eventsRecorded: extraction.characterEvents.length,
    dialoguesExtracted: extraction.dialogues.length,
    speakersResolved: extraction.dialogues.filter((d) => d.speakerId !== '不明').length,
    memorySize: memoryIndex.size,
    errors,
  }

  logger.logMetrics(metrics)

  return extraction
}

/**
 * Run the enhanced extraction pipeline
 */
export async function runEnhancedExtractionPipeline(
  jobId: string,
  novelId: string,
  chunks: string[],
  llmClient: (systemPrompt: string, userPrompt: string) => Promise<string>,
  config: EnhancedPipelineConfig = {},
): Promise<{
  extractions: (ExtractionV2 | null)[]
  castList: ReturnType<typeof generateCastList>
  summary: string
  report: string
}> {
  // Initialize context
  const context = await initializeEnhancedPipeline(jobId, novelId, chunks, config)
  const { logger, performanceTracker } = context

  logger.info('Pipeline', 'Starting enhanced V2 extraction', {
    totalChunks: chunks.length,
    enableSpeakerResolution: config.enableSpeakerResolution,
    enableCache: config.enableCache,
  })

  const extractions: (ExtractionV2 | null)[] = []

  // Process chunks sequentially
  for (let i = 0; i < chunks.length; i++) {
    const extraction = await processChunkEnhanced(i, context, llmClient)

    if (extraction) {
      // Save memory after each chunk
      await performanceTracker.measureAsync(
        'SaveMemory',
        async () => {
          await saveCharacterMemory(context.memoryIndex, context.storagePaths)
          await savePromptMemory(context.memoryIndex, context.storagePaths, {
            currentChunk: i,
          })
          // Save character snapshot for this chunk
          await saveCharacterSnapshot(context.memoryIndex, i, config.dataDir)
        },
        { chunkIndex: i },
      )
    }

    extractions.push(extraction)

    // Progress update
    const progress = (((i + 1) / chunks.length) * 100).toFixed(1)
    logger.info('Progress', `${progress}% complete`, {
      processed: i + 1,
      total: chunks.length,
    })
  }

  // Generate final cast list
  const castList = performanceTracker.measure(
    'GenerateCastList',
    () => generateCastList(context.memoryIndex),
    { jobId },
  )

  const summary = generateCastSummary(castList)

  // Generate final report
  const report = logger.generateSummary()

  logger.info('Pipeline', 'Extraction complete', {
    totalCharacters: castList.length,
    successfulExtractions: extractions.filter((e) => e !== null).length,
    failedExtractions: extractions.filter((e) => e === null).length,
  })

  logger.info('Report', report)

  return {
    extractions,
    castList,
    summary,
    report,
  }
}

/**
 * Pipeline utilities as plain functions (avoid static-only class)
 */
export async function clearMemory(dataDir?: string): Promise<void> {
  const storagePaths = getDefaultStoragePaths(dataDir)
  const memoryIndex = createCharacterMemoryIndex()
  const _aliasIndex = createAliasIndex()
  await saveCharacterMemory(memoryIndex, storagePaths)
  await savePromptMemory(memoryIndex, storagePaths, {})
}

export async function dumpMemory(dataDir?: string): Promise<void> {
  const storagePaths = getDefaultStoragePaths(dataDir)
  const { memoryIndex } = await loadCharacterMemory(storagePaths)
  console.log('\n=== Character Memory Dump ===')
  console.log(`Total Characters: ${memoryIndex.size}\n`)
  for (const [id, memory] of memoryIndex) {
    console.log(`ID: ${id}`)
    console.log(`Names: ${Array.from(memory.names).join(', ')}`)
    console.log(`First Appearance: Chunk ${memory.firstAppearanceChunk}`)
    console.log(`Last Seen: Chunk ${memory.lastSeenChunk}`)
    console.log(`Events: ${memory.timeline.length}`)
    console.log(`Summary: ${memory.summary.substring(0, 200)}...`)
    console.log('---')
  }
}

export function analyzeExtractionQuality(extractions: (ExtractionV2 | null)[]): {
  totalChunks: number
  successRate: number
  avgCharactersPerChunk: number
  avgEventsPerChunk: number
  avgDialoguesPerChunk: number
  unknownSpeakerRate: number
} {
  const validExtractions = extractions.filter((e) => e !== null) as ExtractionV2[]
  const totalChunks = extractions.length
  const successRate = validExtractions.length / totalChunks
  let totalCharacters = 0
  let totalEvents = 0
  let totalDialogues = 0
  let totalUnknownSpeakers = 0
  for (const extraction of validExtractions) {
    totalCharacters += extraction.characters.length
    totalEvents += extraction.characterEvents.length
    totalDialogues += extraction.dialogues.length
    totalUnknownSpeakers += extraction.dialogues.filter((d) => d.speakerId === '不明').length
  }
  return {
    totalChunks,
    successRate,
    avgCharactersPerChunk: totalCharacters / validExtractions.length,
    avgEventsPerChunk: totalEvents / validExtractions.length,
    avgDialoguesPerChunk: totalDialogues / validExtractions.length,
    unknownSpeakerRate: totalDialogues > 0 ? totalUnknownSpeakers / totalDialogues : 0,
  }
}

// Export default configuration
export const defaultPipelineConfig: EnhancedPipelineConfig = {
  enableCache: true,
  enableSpeakerResolution: true,
  enableMetrics: true,
  enableCharacterTracking: true,
  maxRetries: 3,
  logLevel: LogLevel.INFO,
  speakerResolutionConfig: {
    proximityWindow: 100,
    enableVerbPatterns: true,
    enableLastSpeaker: true,
    minConfidenceThreshold: 0.6,
  },
}
