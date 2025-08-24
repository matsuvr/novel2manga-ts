import type { AnalyzeResponse } from '@/types/job'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface CompletionResult {
  response: AnalyzeResponse
}

/**
 * Step responsible for final job completion and status updates
 */
export class CompletionStep implements PipelineStep {
  readonly stepName = 'completion'

  /**
   * Complete job with success response
   */
  async completeJob(
    chunkCount: number,
    hasBoundaries: boolean,
    context: StepContext,
  ): Promise<StepExecutionResult<CompletionResult>> {
    const { jobId, logger } = context

    try {
      const message = hasBoundaries
        ? `テキストを${chunkCount}個のチャンクに分割し、分析を完了しました`
        : `テキストを${chunkCount}個のチャンクに分割し、分析を完了しました（エピソードは検出されませんでした）`

      const response: AnalyzeResponse = {
        success: true,
        id: jobId,
        message,
        data: { jobId, chunkCount },
        metadata: { timestamp: new Date().toISOString() },
      }

      logger.info('Job completion prepared', {
        jobId,
        chunkCount,
        hasBoundaries,
        message,
      })

      return {
        success: true,
        data: { response },
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Failed to complete job', { jobId, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}
