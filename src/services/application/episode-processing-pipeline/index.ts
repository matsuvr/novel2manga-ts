import { Effect } from 'effect'
import type { LoggerPort } from '@/infrastructure/logging/logger'
import type { StepContext } from '@/services/application/steps/base-step'
import { EpisodeProcessingStep } from '@/services/application/steps/episode-processing-step'
import type { EpisodeError } from '@/types/errors/episode-error'
import type { EpisodeBreakPlan, NewMangaScript } from '@/types/script'

export interface EpisodeProcessingPipelineInput {
  readonly jobId: string
  readonly novelId: string
  readonly script: NewMangaScript
  readonly episodeBreaks: EpisodeBreakPlan
}

export interface EpisodeProcessingSuccessData {
  readonly processedEpisodes: Array<{
    episodeNumber: number
    textLength: number
    panelRange: string
  }>
}

export type EpisodeProcessingPipelineResult =
  | { success: true; data: EpisodeProcessingSuccessData }
  | { success: false; error: { message: string; cause?: unknown; episodeNumber?: number } }

export class EpisodeProcessingPipeline {
  private readonly step = new EpisodeProcessingStep()

  constructor(private readonly logger: LoggerPort) {}

  async run(
    input: EpisodeProcessingPipelineInput,
    baseContext: Omit<StepContext, 'jobId' | 'novelId'>,
  ): Promise<EpisodeProcessingPipelineResult> {
    const { jobId, novelId, script, episodeBreaks } = input
    const processed: EpisodeProcessingSuccessData['processedEpisodes'] = []

    for (const ep of episodeBreaks.episodes) {
      const episodeNumber = ep.episodeNumber
      const context: StepContext = { ...baseContext, jobId, novelId }
      this.logger.info('EpisodeProcessingPipeline: start episode text extraction', {
        jobId,
        episodeNumber,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })

      const eff = this.step.extractEpisodeTextFromPanelsEffect(
        script,
        episodeBreaks,
        episodeNumber,
        context,
      )
      const either = await Effect.runPromise(Effect.either(eff))
      if (either._tag === 'Left') {
        const err = either.left as EpisodeError
        this.logger.error('EpisodeProcessingPipeline: episode text extraction failed', {
          jobId,
          episodeNumber,
          error: err.message,
          _tag: (err as { _tag?: string })._tag,
        })
        return {
          success: false,
          error: { message: err.message, cause: err, episodeNumber },
        }
      }
      processed.push({
        episodeNumber,
        textLength: either.right.episodeText.length,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })
      this.logger.info('EpisodeProcessingPipeline: episode text extraction completed', {
        jobId,
        episodeNumber,
        textLength: either.right.episodeText.length,
      })
    }

    return { success: true, data: { processedEpisodes: processed } }
  }
}
