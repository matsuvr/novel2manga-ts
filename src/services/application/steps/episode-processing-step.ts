import { Effect } from 'effect'
import { assembleEpisodeText } from '@/services/application/episode-text/assembler'
import type { EpisodeError } from '@/types/errors/episode-error'
import { DatabaseError, ExternalIOError, ValidationError } from '@/types/errors/episode-error'
import type { EpisodeBreakPlan, NewMangaScript } from '@/types/script'
import { withEpisodeRetry } from '@/utils/retry'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface EpisodeTextResult {
  episodeText: string
}

/**
 * Step responsible for episode text extraction and storage
 */
export class EpisodeProcessingStep implements PipelineStep {
  readonly stepName = 'episode-processing'

  /**
   * Panel Index ベース: 既に正規化 (1..N) 済み Script と EpisodeBreakPlan から対象エピソードのテキストを構築
   * 後方互換の chunk/char offset ロジックは完全撤去。
   */
  async extractEpisodeTextFromPanels(
    script: NewMangaScript,
    breaks: EpisodeBreakPlan,
    episodeNumber: number,
    context: StepContext,
  ): Promise<StepExecutionResult<EpisodeTextResult>> {
    // Legacy Promise-based API kept for backward compatibility (will be removed after full migration)
    const effect = this.extractEpisodeTextFromPanelsEffect(script, breaks, episodeNumber, context)
    const result = await Effect.runPromise(Effect.either(effect))
    if (result._tag === 'Left') {
      const err = result.left
      return { success: false, error: err.message }
    }
    return { success: true, data: result.right }
  }

  /** New Effect-based core implementation */
  extractEpisodeTextFromPanelsEffect(
    script: NewMangaScript,
    breaks: EpisodeBreakPlan,
    episodeNumber: number,
    context: StepContext,
  ): Effect.Effect<EpisodeTextResult, EpisodeError> {
    const { logger, jobId } = context
    const self = this
    const core = Effect.gen(function* () {
      const episode = breaks.episodes.find((e) => e.episodeNumber === episodeNumber)
      if (!episode) {
        return yield* Effect.fail(
          new ValidationError({ message: `Episode ${episodeNumber} not found in break plan` }),
        )
      }
      const assembled = yield* assembleEpisodeText({
        script,
        startPanelIndex: episode.startPanelIndex,
        endPanelIndex: episode.endPanelIndex,
      })
      const episodeText = assembled.episodeText

      // storage + db (wrap in Effect for error mapping)
      yield* Effect.tryPromise({
  try: () => self.storeEpisodeText(episodeText, episodeNumber, context),
        catch: (cause) =>
          new ExternalIOError({
            message: 'Failed to store episode text',
            cause,
            transient: true,
          }),
      }).pipe(
        Effect.catchTag('ExternalIOError', (e) => Effect.fail(e)),
        Effect.catchAll((err) =>
          // fallback classification if not already EpisodeError (should not normally happen)
          Effect.fail(
            err instanceof DatabaseError || err instanceof ExternalIOError
              ? err
              : new DatabaseError({ message: 'Unknown DB/storage failure', cause: err, transient: true }),
          ),
        ),
      )

      logger.info('Episode text constructed from normalized panels', {
        jobId,
        episodeNumber,
        panelRange: `${episode.startPanelIndex}-${episode.endPanelIndex}`,
        panelCount: assembled.panelCount,
        textLength: episodeText.length,
      })
      return { episodeText }
    })

    // Wrap with retry policy for transient storage / DB issues
    return withEpisodeRetry(core, {
      label: 'episode-processing',
      logger: context.logger,
    })
  }


  private async storeEpisodeText(
    episodeText: string,
    episodeNumber: number,
    context: StepContext,
  ): Promise<void> {
    const { novelId, jobId, logger } = context

    const storageModule = await import('@/utils/storage')
    const storage = await storageModule.StorageFactory.getAnalysisStorage()
    const key =
      typeof (storageModule.StorageKeys as unknown as Record<string, unknown>).episodeText ===
      'function'
        ? (
            storageModule.StorageKeys as unknown as {
              episodeText: (params: {
                novelId: string
                jobId: string
                episodeNumber: number
              }) => string
            }
          ).episodeText({ novelId, jobId, episodeNumber })
        : `${novelId}/jobs/${jobId}/analysis/episode_${episodeNumber}.txt`

    const { executeStorageWithDbOperation } = await import(
      '@/services/application/transaction-manager'
    )

    // エピソード本文の保存をストレージ+DB一体のトランザクションで実行（強整合性）
    const { getPorts } = await import('@/ports/factory')
    const ports = getPorts()

    await executeStorageWithDbOperation({
      storage,
      key,
      value: episodeText,
      metadata: {
        contentType: 'text/plain; charset=utf-8',
        jobId,
        novelId,
        episode: String(episodeNumber),
      },
      dbOperation: async () => {
        // Use EpisodePort (Effect を Promise へ実行) for update
  const eff = ports.episode.updateEpisodeTextPath(jobId, episodeNumber, key)
  await Effect.runPromise(eff)
      },
      tracking: {
        filePath: key,
        fileCategory: 'episode',
        fileType: 'txt',
        novelId,
        jobId,
        mimeType: 'text/plain; charset=utf-8',
      },
    })

    logger.info('Episode text saved atomically with DB path update', {
      jobId,
      episodeNumber,
      episodeTextKey: key,
    })
  }

  /**
   * Legacy adapter: returns original StepExecutionResult shape but delegates to Effect core.
   * Use this in legacy pipeline orchestration until all steps are migrated to Effect.
   */
  runLegacy(
    script: NewMangaScript,
    breaks: EpisodeBreakPlan,
    episodeNumber: number,
    context: StepContext,
  ): Promise<StepExecutionResult<EpisodeTextResult>> {
    return this.extractEpisodeTextFromPanels(script, breaks, episodeNumber, context)
  }
}
