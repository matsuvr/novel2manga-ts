import type { Job } from '@/db/schema'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface AnalysisResult {
  completed: boolean
}

/**
 * TextAnalysisStep (V2)
 *
 * The legacy chunk-analysis stage previously invoked an LLM to compute
 * intermediate summaries and structured metadata. That behaviour is no
 * longer required by the production pipeline, so this step now acts as a
 * lightweight placeholder that simply reports completion.
 */
export class TextAnalysisStep implements PipelineStep {
  readonly stepName = 'text-analysis'

  async analyzeChunks(
    chunks: string[],
    existingJob: Job | null,
    context: StepContext,
  ): Promise<StepExecutionResult<AnalysisResult>> {
    const { jobId, logger } = context

    if (existingJob?.analyzeCompleted) {
      logger.info('Chunk analysis step already completed for job, skipping.', {
        jobId,
      })
      return { success: true, data: { completed: true } }
    }

    logger.info('Skipping chunk analysis stage — no LLM call needed.', {
      jobId,
      chunkCount: chunks.length,
    })

    return { success: true, data: { completed: true } }
  }
}
