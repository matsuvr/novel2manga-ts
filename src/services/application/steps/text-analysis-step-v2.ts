import {
  loadCharacterMemory,
  loadPromptMemory,
  saveCharacterMemory,
  savePromptMemory,
} from '@/character/persistence'
import { buildIdMapping, recordEvents, summarizeMemory } from '@/character/state'
import { getCharacterMemoryConfig } from '@/config'
import type { Job } from '@/db/schema'
import { generateExtractionV2UserPrompt, getExtractionV2SystemPrompt } from '@/prompts/extractionV2'
import { db } from '@/services/database'
import type { AliasIndex, CharacterMemoryIndex, ExtractionV2 } from '@/types/extractionV2'
import { isTempCharacterId } from '@/types/extractionV2'
import { getStoredSummary, loadOrGenerateSummary } from '@/utils/chunk-summary'
import { ExtractionV2Schema } from '@/validation/extractionV2'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface AnalysisResult {
  completed: boolean
}

/**
 * Step responsible for LLM-based text analysis of chunks with V2 extraction
 */
export class TextAnalysisStep implements PipelineStep {
  readonly stepName = 'text-analysis'

  // Use the V2 schema for validation
  private static readonly textAnalysisOutputSchema = ExtractionV2Schema

  /**
   * Analyze chunks with LLM or skip if already completed
   */
  async analyzeChunks(
    chunks: string[],
    existingJob: Job | null,
    context: StepContext,
  ): Promise<StepExecutionResult<AnalysisResult>> {
    const { jobId, logger, ports } = context

    try {
      // Skip analysis if already completed for resumed jobs
      if (existingJob?.analyzeCompleted) {
        logger.info('Analysis step already completed, skipping analysis', { jobId })
        return { success: true, data: { completed: true } }
      }

      // Initialize character memory
      const { memoryIndex, aliasIndex } = await loadCharacterMemory(jobId)
      let nextIdCounter = 1

      // Find the highest existing character ID
      for (const id of memoryIndex.keys()) {
        const match = id.match(/^char_(\d+)$/)
        if (match) {
          nextIdCounter = Math.max(nextIdCounter, parseInt(match[1]) + 1)
        }
      }

      // V2は人物状態を維持するため逐次処理を行う
      await this.analyzeConcurrentlyV2(
        chunks,
        { jobId, logger, ports },
        { memoryIndex, aliasIndex, nextIdCounter },
      )

      return { success: true, data: { completed: true } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to analyze chunks', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  private async analyzeConcurrentlyV2(
    chunks: string[],
    context: Pick<StepContext, 'jobId' | 'logger' | 'ports'>,
    memoryContext: {
      memoryIndex: CharacterMemoryIndex
      aliasIndex: AliasIndex
      nextIdCounter: number
    },
  ): Promise<void> {
    const { jobId, logger, ports } = context
    const { memoryIndex, aliasIndex } = memoryContext
    const jobDb = db.jobs()

    // Process chunks sequentially to maintain character continuity
    // (V2 requires sequential processing for character state management)
    for (let i = 0; i < chunks.length; i++) {
      jobDb.updateJobStep(jobId, `analyze_chunk_${i}`)
      const chunkText = chunks[i]

      // Load current prompt memory
      const promptMemory = await loadPromptMemory(jobId)

      // Ensure summaries for current and adjacent chunks (tolerate storage/LLM failures in unit tests)
      let prevSummary = ''
      let nextSummary = ''
      try {
        await loadOrGenerateSummary(jobId, i, chunkText)
        prevSummary = i > 0 ? (await getStoredSummary(jobId, i - 1)) || '' : ''
        nextSummary =
          i + 1 < chunks.length ? await loadOrGenerateSummary(jobId, i + 1, chunks[i + 1]) : ''
      } catch (summaryError) {
        logger.warn('Summary generation unavailable; continuing with empty summaries', {
          jobId,
          chunkIndex: i,
          error: (summaryError as Error).message,
        })
      }

      // Generate V2 prompts
      const systemPrompt = getExtractionV2SystemPrompt()
      const userPrompt = generateExtractionV2UserPrompt(
        i,
        chunkText,
        prevSummary || '',
        nextSummary || '',
        promptMemory,
      )

      const textAnalysisOutputSchema = TextAnalysisStep.textAnalysisOutputSchema
      let result: ExtractionV2

      try {
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
        const analysis = await analyzeChunkWithFallback(
          userPrompt, // The user prompt is already formatted
          textAnalysisOutputSchema,
          {
            systemPrompt,
            maxRetries: 0,
            jobId,
            chunkIndex: i,
          },
        )
        result = analysis.result
      } catch (firstError) {
        logger.warn('Chunk analysis failed, retrying', {
          jobId,
          chunkIndex: i,
          error: firstError instanceof Error ? firstError.message : String(firstError),
        })
        jobDb.updateJobStep(jobId, `analyze_chunk_${i}_retry`)

        try {
          const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
          const analysis = await analyzeChunkWithFallback(userPrompt, textAnalysisOutputSchema, {
            systemPrompt,
            maxRetries: 0,
            jobId,
            chunkIndex: i,
          })
          result = analysis.result
        } catch (retryError) {
          const errorMessage = retryError instanceof Error ? retryError.message : String(retryError)
          logger.error('Chunk analysis failed after retry', {
            jobId,
            chunkIndex: i,
            firstError: firstError instanceof Error ? firstError.message : String(firstError),
            retryError: errorMessage,
          })
          jobDb.updateJobStatus(jobId, 'failed', `Chunk ${i} analysis failed: ${errorMessage}`)
          throw retryError
        }
      }

      if (!result) {
        const errorMessage = `Failed to generate analysis result for chunk ${i}`
        logger.error(errorMessage, { jobId, chunkIndex: i })
        jobDb.updateJobStatus(jobId, 'failed', errorMessage)
        throw new Error(errorMessage)
      }

      // Update character memory with extraction results
      const idMapping = buildIdMapping(
        result.characters,
        memoryIndex,
        aliasIndex,
        i,
        () => memoryContext.nextIdCounter++,
      )

      // Rewrite IDs in character events
      const rewrittenEvents = result.characterEvents.map((event) => {
        if (isTempCharacterId(event.characterId)) {
          const mapped = idMapping.get(event.characterId)
          return { ...event, characterId: mapped ?? event.characterId }
        }
        return event
      }) as typeof result.characterEvents

      // Rewrite IDs in dialogues
      const rewrittenDialogues = result.dialogues.map((dialogue) => {
        if (isTempCharacterId(dialogue.speakerId)) {
          const mapped = idMapping.get(dialogue.speakerId)
          return { ...dialogue, speakerId: mapped ?? dialogue.speakerId }
        }
        return dialogue
      }) as typeof result.dialogues

      // Record events in memory
      recordEvents(memoryIndex, rewrittenEvents, i, idMapping)

      // Summarize memory for characters that have grown too large
      const { summaryMaxLength } = getCharacterMemoryConfig()
      for (const [characterId, memory] of memoryIndex) {
        if (memory.summary && memory.summary.length > summaryMaxLength) {
          summarizeMemory(memoryIndex, characterId, summaryMaxLength)
        }
      }

      // Update extraction with rewritten IDs
      result.characterEvents = rewrittenEvents
      result.dialogues = rewrittenDialogues

      // Save updated character memory
      await saveCharacterMemory(jobId, memoryIndex)
      await savePromptMemory(jobId, memoryIndex, {
        currentChunk: i,
      })

      const analysisData = {
        chunkIndex: i,
        jobId,
        analysis: result,
        analyzedAt: new Date().toISOString(),
      }

      // Save analysis result
      await ports.analysis.putAnalysis(jobId, i, JSON.stringify(analysisData, null, 2))
      jobDb.updateJobStep(jobId, `analyze_chunk_${i}_done`)

      logger.info(
        `Chunk ${i} analyzed: ${result.characters.length} characters, ${result.characterEvents.length} events`,
        {
          jobId,
          chunkIndex: i,
        },
      )
    }
  }
}
