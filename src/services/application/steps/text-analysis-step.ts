import { z } from 'zod'
import { getTextAnalysisConfig } from '@/config'
import { loadOrGenerateSummary, getStoredSummary } from '@/utils/chunk-summary'
import type { Job } from '@/db/schema'
import { db } from '@/services/database/index'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface AnalysisResult {
  completed: boolean
}

/**
 * Step responsible for LLM-based text analysis of chunks
 */
export class TextAnalysisStep implements PipelineStep {
  readonly stepName = 'text-analysis'

  private static readonly textAnalysisOutputSchema = z
    .object({
      characters: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          firstAppearance: z.number(),
        }),
      ),
      scenes: z.array(
        z.object({
          location: z.string(),
          time: z.string().nullable().optional(),
          description: z.string(),
          startIndex: z.number(),
          endIndex: z.number(),
        }),
      ),
      dialogues: z.array(
        z.object({
          speakerId: z.string(),
          text: z.string(),
          emotion: z.string(),
          index: z.number(),
        }),
      ),
      highlights: z.array(
        z.object({
          type: z.enum(['climax', 'turning_point', 'emotional_peak', 'action_sequence']),
          description: z.string(),
          importance: z.number(),
          startIndex: z.number(),
          endIndex: z.number(),
        }),
      ),
      situations: z.array(
        z.object({
          description: z.string(),
          index: z.number(),
        }),
      ),
    })
    .strip()

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

      // Pre-generate summaries to avoid race conditions and redundant LLM calls
      for (let i = 0; i < chunks.length; i++) {
        await loadOrGenerateSummary(jobId, i, chunks[i])
      }

      // Analyze chunks with limited concurrency
      const maxConcurrent = Math.max(1, Math.min(3, chunks.length))
      await this.analyzeConcurrently(chunks, maxConcurrent, { jobId, logger, ports })

      return { success: true, data: { completed: true } }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to analyze chunks', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  private async analyzeConcurrently(
    chunks: string[],
    maxConcurrent: number,
    context: Pick<StepContext, 'jobId' | 'logger' | 'ports'>,
  ): Promise<void> {
    const { jobId, logger, ports } = context
    const jobDb = db.jobs()

    const runOne = async (i: number) => {
      // ここで「DBのジョブ進捗を更新（analyze_chunk_i ステップ）」
      jobDb.updateJobStep(jobId, `analyze_chunk_${i}`)
      const chunkText = chunks[i]
      const config = getTextAnalysisConfig()
      if (!config?.userPromptTemplate) {
        throw new Error('Text analysis config is invalid: userPromptTemplate is missing')
      }
      const prevSummary = i > 0 ? ((await getStoredSummary(jobId, i - 1)) ?? '') : ''
      const nextSummary =
        i + 1 < chunks.length ? ((await getStoredSummary(jobId, i + 1)) ?? '') : ''
      // ここで「LLM に渡すユーザープロンプトを生成」
      const prompt = config.userPromptTemplate
        .replace('{{chunkIndex}}', i.toString())
        .replace('{{chunkText}}', chunkText)
        .replace('{{previousChunkSummary}}', prevSummary)
        .replace('{{nextChunkSummary}}', nextSummary)

      const textAnalysisOutputSchema = TextAnalysisStep.textAnalysisOutputSchema
      let result: z.infer<typeof textAnalysisOutputSchema>
      try {
        const { analyzeChunkWithFallback } = await import('@/agents/chunk-analyzer')
        const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
          maxRetries: 0,
          jobId,
          chunkIndex: i,
        })
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
          const analysis = await analyzeChunkWithFallback(prompt, textAnalysisOutputSchema, {
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

      const analysisData = {
        chunkIndex: i,
        jobId,
        analysis: result,
        analyzedAt: new Date().toISOString(),
      }
      // ここで「ストレージ（ファイル）に分析結果を書き込む」
      await ports.analysis.putAnalysis(jobId, i, JSON.stringify(analysisData, null, 2))
      jobDb.updateJobStep(jobId, `analyze_chunk_${i}_done`)
      return true as const
    }

    // Use a queue to avoid race conditions with shared nextIndex
    const chunkIndices = Array.from({ length: chunks.length }, (_, i) => i)
    const worker = async () => {
      while (true) {
        const i = chunkIndices.shift()
        if (i === undefined) break
        await runOne(i)
      }
    }

    await Promise.all(Array.from({ length: maxConcurrent }, () => worker()))
  }
}
