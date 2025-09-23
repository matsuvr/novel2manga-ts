import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'

// repositories shim no longer used
// import { db } from '@/services/database/index'  // 直接のインポートを削除

import { getLayoutBundlingConfig, getLayoutLimits } from '@/config/layout.config'
// Cleaned legacy steps: ScriptMergeStep, TextAnalysisStepV2 removed
import type { NewMangaScript } from '@/types/script'
import { LayoutPipeline } from './layout-pipeline'
// Import pipeline steps
import {
  BasePipelineStep,
  CompletionStep,
  JobManagementStep,
  NovelManagementStep,
  RenderingStep,
  type StepContext,
  TextChunkingStep,
} from './steps'
import { ChunkScriptStep } from './steps/chunk-script-step'
import { EpisodeBreakEstimationStep } from './steps/episode-break-estimation-step'

export interface AnalyzeOptions {
  isDemo?: boolean
  title?: string
  /**
   * 事前に発行済みの jobId を指定する場合に使用。
   * 指定された場合、本クラス内では新規ジョブ作成（create）は行わず、
   * 以降のステップ更新のみを実施します。
   */
  existingJobId?: string
}

/**
 * AnalyzePipeline - Main production analysis service
 *
 * 責務: 小説テキストの処理からレイアウト生成・レンダリングまでの一連の処理
 * フロー: チャンク分割 → episodeBreakEstimation → layout → render (scriptConversion 廃止)
 *
 * 使用箇所: /api/analyze（プロダクションメインエンドポイント）
 * テスト: src/__tests__/integration/service-integration.test.ts など多数
 *
 * 重要: このファイルでは「どこで何を I/O するか／LLM を呼ぶか」を日本語コメントで明示
 */
export class AnalyzePipeline extends BasePipelineStep {
  readonly stepName = 'analyze-pipeline'

  private readonly novelStep = new NovelManagementStep()
  private readonly jobStep = new JobManagementStep()
  private readonly chunkingStep = new TextChunkingStep()
  private readonly chunkScriptStep = new ChunkScriptStep()
  private readonly episodeBreakStep = new EpisodeBreakEstimationStep()
  private readonly renderingStep = new RenderingStep()
  private readonly completionStep = new CompletionStep()

  constructor(
    private readonly ports: StoragePorts = getStoragePorts(),
    // keep optional logger for future detailed tracing via getLogger().withContext
    _logger: LoggerPort = getLogger().withContext({ service: 'analyze-pipeline' }),
  ) {
    super()
  }

  async runWithNovelId(novelId: string, options: AnalyzeOptions = {}) {
    const logger = getLogger().withContext({ service: 'analyze-pipeline' })

    const result = await this.novelStep.runWithNovelId(novelId, {
      logger,
      ports: this.ports,
    })

    if (!result.success) {
      const { ApiError } = await import('@/utils/api-error')
      throw new ApiError(result.error, 404, 'NOT_FOUND')
    }

    return this.runWithText(novelId, result.data.text, {
      ...options,
      title: result.data.title || options.title,
    })
  }

  async runWithText(novelId: string, novelText: string, options: AnalyzeOptions = {}) {
    const logger = getLogger().withContext({ service: 'analyze-pipeline' })
    logger.info('AnalyzePipeline.runWithText: start', { novelId, textLength: novelText.length })

    const title = options.title || 'Novel'

    const context: StepContext = {
      jobId: '', // Will be set after job initialization
      novelId,
      logger,
      ports: this.ports,
      isDemo: options.isDemo,
    }

    // Ensure novel persistence before job creation
    const novelPersistResult = await this.novelStep.ensureNovelPersistence(
      novelId,
      novelText,
      title,
      { logger },
    )
    if (!novelPersistResult.success) {
      throw new Error(novelPersistResult.error)
    }

    // Initialize or resume job
    const jobInitResult = await this.jobStep.initializeJob(
      novelId,
      { title, existingJobId: options.existingJobId },
      { logger },
    )
    if (!jobInitResult.success) {
      throw new Error(jobInitResult.error)
    }

    const { jobId, existingJob } = jobInitResult.data
    context.jobId = jobId

    // ------------------------------------------------------------
    // Narrativity 早期判定 & ブランチ自動設定 (DRY 化: ensureBranchMarker)
    // - 既存マーカーがあれば尊重（再分類しない）
    // - 無ければ LLM 分類 + 保存
    // ------------------------------------------------------------
    try {
      const { ensureBranchMarker } = await import('@/utils/branch-marker')
      const ensured = await ensureBranchMarker(jobId, novelText)
      if (ensured.created) {
        logger.info('Auto branch classification applied', {
          jobId,
          branch: ensured.branch,
          reason: ensured.reason,
          metrics: ensured.metrics,
          source: ensured.source,
        })
      } else {
        logger.info('Existing branch marker preserved (no auto classification)', {
          jobId,
          branch: ensured.branch,
        })
      }
    } catch (e) {
      logger.warn('Branch auto-classification failed (continuing as NORMAL if absent)', {
        jobId,
        error: e instanceof Error ? e.message : String(e),
      })
    }

    // Process text chunks
    const chunkingResult = await this.chunkingStep.processTextChunks(
      novelText,
      existingJob || null,
      context,
    )
    if (!chunkingResult.success) {
      throw new Error(chunkingResult.error)
    }

    const { chunks, totalChunks } = chunkingResult.data

    // Update job progress for chunking
    if (!existingJob?.splitCompleted) {
      await this.updateJobStep(jobId, 'split', { logger }, 0, totalChunks)
      await this.markStepCompleted(jobId, 'split', { logger })
    }

    // Legacy per-chunk analysis stage removed; keep analyze step markers for backward compatibility
    await this.updateJobStep(jobId, 'analyze', { logger }, 0, chunks.length)

    // チャンクごとの脚本生成
    logger.info('Starting chunk script conversion', { jobId, chunkCount: chunks.length })
    const chunkScriptRes = await this.chunkScriptStep.convertChunksToScripts(chunks, context)
    if (!chunkScriptRes.success) {
      logger.error('Chunk script conversion failed', {
        jobId,
        error: chunkScriptRes.error,
        chunkCount: chunks.length
      })
      await this.updateJobStatus(jobId, 'failed', { logger }, chunkScriptRes.error)
      throw new Error(chunkScriptRes.error)
    }
    logger.info('Chunk script conversion completed successfully', {
      jobId,
      chunkCount: chunks.length,
      resultSuccess: chunkScriptRes.success
    })

    // ストレージとキーヘルパーをインポート
    const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
    const analysisStorage = await StorageFactory.getAnalysisStorage()

    // 即座にファイルの存在を確認
    logger.info('Verifying script chunk files immediately after conversion', { jobId })

    for (let i = 0; i < chunks.length; i++) {
      const key = JsonStorageKeys.scriptChunk({ novelId: context.novelId, jobId, index: i })
      const obj = await analysisStorage.get(key)
      logger.info('Post-conversion file check', {
        jobId,
        chunkIndex: i,
        key,
        exists: !!obj,
        fileSize: obj?.text?.length || 0
      })
    }

  // Mark analyze step complete (legacy compatibility)
  await this.markStepCompleted(jobId, 'analyze', { logger })

    // UI遷移の空白対策: ここで currentStep=episode をセット
    await this.updateJobStep(jobId, 'episode', { logger }, 0, 4)

    // ここで直接チャンク脚本を結合して combined script を作成・保存（ScriptMergeStep を撤去）

    const allPanels: Array<NewMangaScript['panels'][number]> = []
    try {
      // 実在する script_chunk_{i}.json を順番に読む
      let foundChunks = 0
      for (let i = 0; ; i++) {
        const key = JsonStorageKeys.scriptChunk({ novelId: context.novelId, jobId, index: i })
        logger.info('Attempting to read script chunk', { jobId, chunkIndex: i, key, novelId: context.novelId })

        const obj = await analysisStorage.get(key)
        if (!obj) {
          logger.info('No more script chunks found', { jobId, lastIndex: i - 1, totalChunks: foundChunks })
          break
        }
        foundChunks++

        let parsed: NewMangaScript
        try {
          parsed = JSON.parse(obj.text) as NewMangaScript
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          logger.error('Failed to parse script_chunk JSON', {
            jobId,
            chunkIndex: i,
            error: msg,
            textPreview: obj.text.substring(0, 200)
          })
          throw new Error(`Failed to parse script chunk ${i}: ${msg}`)
        }

        if (Array.isArray(parsed.panels)) {
          allPanels.push(...parsed.panels)
          logger.info('Collected panels from chunk', {
            jobId,
            chunkIndex: i,
            panelCount: parsed.panels.length,
            totalPanelsSoFar: allPanels.length
          })
        } else {
          logger.warn('script_chunk has no panels array', {
            jobId,
            chunkIndex: i,
            parsedKeys: Object.keys(parsed),
            hasStyle: !!parsed.style_tone,
            hasCharacters: !!parsed.characters,
            hasLocations: !!parsed.locations
          })
        }
      }

      logger.info('Script chunk collection completed', {
        jobId,
        totalChunks: foundChunks,
        totalPanels: allPanels.length
      })
    } catch (mergeErr) {
      const msg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr)
      logger.error('Failed during inline script merge', {
        jobId,
        error: msg,
        novelId: context.novelId,
        totalPanelsCollected: allPanels.length,
        stackTrace: mergeErr instanceof Error ? mergeErr.stack : 'No stack trace available'
      })
      await this.updateJobStatus(jobId, 'failed', { logger }, msg)
      throw new Error(msg)
    }

    if (allPanels.length === 0) {
      const msg = 'Inline script merge produced 0 panels'
      logger.error(msg, {
        jobId,
        novelId: context.novelId,
        context: {
          chunkScriptStepSuccess: chunkScriptRes.success,
          // デバッグ用: ストレージに何があるかチェック
          debugInfo: 'Checking script chunk files existence'
        }
      })

      // デバッグ用: 実際にストレージファイルが存在するかチェック
      try {
        const debugKeys = []
        for (let i = 0; i < 10; i++) {
          const key = JsonStorageKeys.scriptChunk({ novelId: context.novelId, jobId, index: i })
          const obj = await analysisStorage.get(key)
          debugKeys.push({ index: i, key, exists: !!obj, textLength: obj?.text?.length || 0 })
        }
        logger.error('Debug: Script chunk files check', { jobId, debugKeys })
      } catch (debugErr) {
        logger.error('Debug check failed', { jobId, debugError: debugErr instanceof Error ? debugErr.message : String(debugErr) })
      }

      await this.updateJobStatus(jobId, 'failed', { logger }, msg)
      throw new Error(msg)
    }

  // Downstream steps only require panels; other fields are optional in practice
  const combinedScript = { panels: allPanels } as NewMangaScript
    await analysisStorage.put(
      JsonStorageKeys.scriptCombined({ novelId: context.novelId, jobId }),
      JSON.stringify(combinedScript, null, 2),
      { contentType: 'application/json; charset=utf-8', jobId, novelId: context.novelId },
    )

    // エピソード切れ目検出の進捗を25%に更新
    await this.updateJobStep(jobId, 'episode', { logger }, 1, 4)
    logger.info('エピソード構成: 切れ目検出を開始', { jobId, progress: '25%' })

    // エピソード切れ目検出（combinedScript を直接渡す）
    const episodeRes = await this.episodeBreakStep.estimateEpisodeBreaks(combinedScript, context)
    if (!episodeRes.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, episodeRes.error)
      throw new Error(episodeRes.error)
    }

    // エピソード検出完了を50%に更新
    await this.updateJobStep(jobId, 'episode', { logger }, 2, 4)
    logger.info('エピソード構成: 切れ目検出完了', {
      jobId,
      progress: '50%',
      episodeCount: episodeRes.data.episodeBreaks.episodes.length,
    })

    // エピソード境界をDBへ永続化（最小フィールドアップサート）
    try {
      const { db } = await import('@/services/database')
      const job = await db.jobs().getJob(jobId)
      if (!job) throw new Error(`Job not found for episode persistence: ${jobId}`)

      // F6: Chunk 依存縮退
      // panel-to-chunk マッピングを撤去し、DB 永続化は panel index を正とする。
      // 互換のため chunk フィールドは 0 埋めで保持 (後続マイグレーションで削除予定)。
      const { EpisodeWriteService } = await import('@/services/application/episode-write')
      const episodeWriter = new EpisodeWriteService()
      const episodesForDb = episodeRes.data.episodeBreaks.episodes.map((ep) => ({
        novelId: job.novelId,
        jobId,
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        summary: undefined,
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        startPanelIndex: ep.startPanelIndex,
        endPanelIndex: ep.endPanelIndex,
        confidence: 1,
      }))
      logger.info('episode:persistence_panel_index_mode', {
        jobId,
        episodes: episodesForDb.length,
        note: 'chunk fields zero-filled; startPanelIndex/endPanelIndex persisted',
      })
      await this.updateJobStep(jobId, 'episode', { logger }, 3, 4)
      logger.info('エピソード構成: データベース保存を開始', {
        jobId,
        progress: '75%',
        episodeCount: episodesForDb.length,
      })

      await episodeWriter.bulkReplaceByJobId(episodesForDb)
      try {
        const persisted = await (await import('@/services/database')).db
          .episodes()
          .getEpisodesByJobId(jobId)
        logger.info('Episode persistence summary', {
          jobId,
          requested: episodesForDb.length,
          persisted: persisted.length,
        })

        if (persisted.length < episodesForDb.length) {
          const errorMessage = `Episode persistence mismatch (req=${episodesForDb.length}, got=${persisted.length})`
          logger.error('Episode persistence integrity check failed', {
            jobId,
            requestedEpisodes: episodesForDb.length,
            persistedEpisodes: persisted.length,
            requestedEpisodeNumbers: episodesForDb.map((ep) => ep.episodeNumber),
            persistedEpisodeNumbers: persisted.map((ep) => ep.episodeNumber),
          })
          await this.updateJobStatus(jobId, 'failed', { logger }, errorMessage)
          throw new Error(errorMessage)
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('Episode persistence mismatch')) {
          throw e
        }
        logger.warn('Episode persistence summary failed', {
          jobId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
      logger.info('エピソード構成: 完了', { jobId, progress: '100%' })
      await this.markStepCompleted(jobId, 'episode', { logger })

      await this.updateJobStep(jobId, 'layout', { logger }, totalChunks, totalChunks)
    } catch (persistEpisodesError) {
      logger.error('Failed to persist episodes during episode step', {
        jobId,
        error:
          persistEpisodesError instanceof Error
            ? persistEpisodesError.message
            : String(persistEpisodesError),
      })
      try {
        await this.updateJobStatus(jobId, 'failed', { logger }, String(persistEpisodesError))
      } catch (e) {
        logger.warn('Failed to update job status after episode persistence error', {
          jobId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
      throw persistEpisodesError
    }

    // LayoutPipeline に委譲 (segmentation→alignment→bundling→layout persistence)
    const rawLayoutStorage = await (await import('@/utils/storage')).StorageFactory.getLayoutStorage()
    const layoutPipeline = new LayoutPipeline({
      logger,
      layoutStorage: {
        put: async (key: string, value: string, opts?: Record<string, unknown>) => {
          // Strip non-string meta values
            const meta: Record<string, string> | undefined = opts
              ? Object.fromEntries(
                  Object.entries(opts)
                    .filter(([, v]) => typeof v === 'string')
                    .map(([k, v]) => [k, String(v)]),
                )
              : undefined
          await rawLayoutStorage.put(key, value, meta)
        },
      },
      db: {
        jobs: {
          getJob: async (id: string) => {
            const { db } = await import('@/services/database')
            const jobsMember: unknown = (db as unknown as { jobs?: unknown }).jobs
            const jobsSvc: unknown = typeof jobsMember === 'function' ? (jobsMember as () => unknown)() : jobsMember
            if (
              !jobsSvc ||
              typeof (jobsSvc as { getJob?: unknown }).getJob !== 'function'
            ) {
              throw new Error('jobs service getJob not available on db mock')
            }
            const job = await (jobsSvc as { getJob: (id: string) => Promise<unknown> }).getJob(id)
            if (
              job &&
              typeof job === 'object' &&
              'id' in job &&
              'novelId' in job
            ) {
              return job as { id: string; novelId: string; totalChunks?: number | null }
            }
            return null
          },
        },
        layout: {
          upsertLayoutStatus: async (payload) => {
            const { db } = await import('@/services/database')
            const layoutMember: unknown = (db as unknown as { layout?: unknown }).layout
            const layoutSvc: unknown = typeof layoutMember === 'function' ? (layoutMember as () => unknown)() : layoutMember
            if (
              !layoutSvc ||
              typeof (layoutSvc as { upsertLayoutStatus?: unknown }).upsertLayoutStatus !== 'function'
            ) {
              // テスト環境や一部の軽量モックでは layout.upsertLayoutStatus を提供していないケースがある。
              // 旧実装 (page-break-step) ではこの呼び出しがスキップされても致命的ではなく、
              // LayoutPipeline の主要成果物 (bundled episodes / totalPages / layout JSON 保存) には影響しない。
              // そのため本番以外 (NODE_ENV==='test') かつメソッド未定義の場合は警告ログを出し no-op にフォールバックする。
              if (process.env.NODE_ENV === 'test') {
                try {
                  logger.warn('layout.upsertLayoutStatus unavailable in test mock – skipping persistence (no-op)', {
                    jobId: payload.jobId,
                    episodeNumber: payload.episodeNumber,
                  })
                } catch {
                  // logger 取得に失敗しても無視
                }
                return
              }
              // 本番環境で未定義は想定外なのでエラーにする
              throw new Error('(mock) layout.upsertLayoutStatus not available')
            }
            await (layoutSvc as { upsertLayoutStatus: (p: typeof payload) => Promise<void> }).upsertLayoutStatus(payload)
          },
        },
        episodesWriter: {
          bulkReplaceByJobId: async (episodes) => {
            const { EpisodeWriteService } = await import('@/services/application/episode-write')
            const writer = new EpisodeWriteService()
            await writer.bulkReplaceByJobId(
              episodes.map((e) => ({
                ...e,
                confidence: e.confidence ?? 1,
              })),
            )
          },
        },
      },
      bundling: getLayoutBundlingConfig(),
      limits: getLayoutLimits(),
    })

    const layoutRes = await layoutPipeline.run({
      jobId,
      novelId: context.novelId,
      script: combinedScript,
      episodeBreaks: episodeRes.data.episodeBreaks,
      isDemo: options.isDemo,
    })
    if (!layoutRes.success) {
      logger.error('LayoutPipeline failed', { jobId, error: layoutRes.error })
      await this.updateJobStatus(jobId, 'failed', { logger }, layoutRes.error.message)
      throw new Error(layoutRes.error.message)
    }
    await this.updateJobTotalPages(jobId, layoutRes.data.totalPages, { logger })
    await this.markStepCompleted(jobId, 'layout', { logger })
    // Bundled episodes (post-alignment & bundling) drive rendering order
    const episodeNumbers = layoutRes.data.bundledEpisodes.episodes.map((ep) => ep.episodeNumber)

    // レンダリング
    await this.updateJobStep(jobId, 'render', { logger }, 0)
    const renderingResult = await this.renderingStep.renderEpisodes(
      episodeNumbers,
      { isDemo: options.isDemo },
      context,
    )
    if (!renderingResult.success) {
      logger.error('Rendering failed', { jobId, error: renderingResult.error })
      if (!options.isDemo) {
        throw new Error(renderingResult.error)
      }
    }
    await this.markStepCompleted(jobId, 'render', { logger })

    // 完了整合性チェック
    try {
      logger.info('Running job completion integrity check', {
        jobId,
        expectedEpisodes: episodeNumbers.length,
      })
      const { db } = await import('@/services/database')
      const episodes = await db.episodes().getEpisodesByJobId(jobId)
      const epCount = episodes.length
      if (epCount === 0) {
        const diagInfo = {
          episodesCount: 0,
          layoutFileCount: 0,
          layoutStatusCount: 0,
          storageError: null as string | null,
        }

        try {
          diagInfo.episodesCount = episodes.length
          diagInfo.layoutStatusCount = epCount

          const { StorageFactory, StorageKeys } = await import('@/utils/storage')
          const storage = await StorageFactory.getLayoutStorage()
          for (const ep of episodes) {
            const layoutKey = StorageKeys.episodeLayout({
              novelId: ep.novelId,
              jobId,
              episodeNumber: ep.episodeNumber,
            })
            const layoutExists = await storage.get(layoutKey)
            if (layoutExists?.text) {
              diagInfo.layoutFileCount++
            }
          }
        } catch (diagError) {
          diagInfo.storageError = diagError instanceof Error ? diagError.message : String(diagError)
        }

        const reason = options.isDemo
          ? 'Demo mode - rendering skipped'
          : `No episodes persisted for this job (episodes=${diagInfo.episodesCount}, layoutFiles=${diagInfo.layoutFileCount}, layoutStatus=${diagInfo.layoutStatusCount})`
        const fullMessage = diagInfo.storageError
          ? `${reason}; diagnostic error: ${diagInfo.storageError}`
          : `${reason}; refusing to mark as completed`

        logger.error('Job completion integrity check details', {
          jobId,
          epCount,
          diagInfo,
          isDemo: options.isDemo,
        })

        throw new Error(fullMessage)
      }
    } catch (guardError) {
      const errorMessage = String(guardError)
      logger.error('Job completion integrity check failed', {
        jobId,
        error: errorMessage,
        isDemo: options.isDemo,
      })
      await this.updateJobStatus(jobId, 'failed', { logger }, errorMessage)
      throw guardError
    }

    // 完了
    await this.updateJobStep(jobId, 'complete', { logger })
    await this.updateJobStatus(jobId, 'completed', { logger })
    const completionResult = await this.completionStep.completeJob(totalChunks, true, context)
    if (!completionResult.success) {
      throw new Error(completionResult.error)
    }
    logger.info('AnalyzePipeline.runWithText: completed (simplified flow)', {
      jobId,
      chunkCount: totalChunks,
    })
    return { jobId, chunkCount: totalChunks, response: completionResult.data.response }
  }

  async resumeJob(jobId: string): Promise<{ resumePoint: string }> {
    const logger = getLogger().withContext({ service: 'analyze-pipeline' })
    logger.info('AnalyzePipeline.resumeJob: start', { jobId })

    const { db } = await import('@/services/database/index')
    const job = await db.jobs().getJob(jobId)
    if (!job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    const novel = await db.novels().getNovel(job.novelId)
    if (!novel) {
      throw new Error(`Novel not found: ${job.novelId}`)
    }

    logger.info('Resume job state', {
      jobId,
      novelId: job.novelId,
      status: job.status,
      currentStep: job.currentStep,
      splitCompleted: job.splitCompleted,
      analyzeCompleted: job.analyzeCompleted,
      episodeCompleted: job.episodeCompleted,
      layoutCompleted: job.layoutCompleted,
      renderCompleted: job.renderCompleted,
    })

    const isActuallyCompleted =
      job.splitCompleted &&
      job.analyzeCompleted &&
      job.episodeCompleted &&
      job.layoutCompleted &&
      job.renderCompleted

    if (job.status === 'completed' && isActuallyCompleted) {
      logger.info('Job already completed, nothing to resume', { jobId })
      return { resumePoint: 'completed' }
    }

    if (job.status === 'completed' && !isActuallyCompleted) {
      logger.warn('Job marked as completed but steps incomplete, resetting status to processing', {
        jobId,
        splitCompleted: job.splitCompleted,
        analyzeCompleted: job.analyzeCompleted,
        episodeCompleted: job.episodeCompleted,
        layoutCompleted: job.layoutCompleted,
        renderCompleted: job.renderCompleted,
      })
      db.jobs().updateJobStatus(
        jobId,
        'processing',
        'Status reset - incomplete steps detected during resume',
      )
    }

    let novelText: string
    try {
      const novelStorage = await (await import('@/utils/storage')).StorageFactory.getNovelStorage()
      const key = `${job.novelId}.json`
      const novelData = await novelStorage.get(key)
      if (!novelData || !novelData.text) {
        throw new Error(`Novel text not found in storage: ${key}`)
      }
      novelText = typeof novelData.text === 'string' ? novelData.text : String(novelData.text)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logger.error('Failed to load novel text from storage', {
        jobId,
        novelId: job.novelId,
        error: message,
      })
      throw new Error(`Failed to load novel text: ${message}`)
    }

    let resumePoint: string

    if (!job.splitCompleted) {
      resumePoint = 'split'
      logger.info('Resuming from split step', { jobId })
    } else if (!job.analyzeCompleted) {
      resumePoint = 'analyze'
      logger.info('Resuming from analyze step', { jobId })
    } else if (!job.episodeCompleted) {
      resumePoint = 'episode'
      logger.info('Resuming from episode step', { jobId })
    } else if (!job.layoutCompleted) {
      resumePoint = 'layout'
      logger.info('Resuming from layout step', { jobId })
    } else if (!job.renderCompleted) {
      resumePoint = 'render'
      logger.info('Resuming from render step', { jobId })
    } else {
      resumePoint = 'completed'
      logger.info('All steps completed, marking as completed', { jobId })
      await this.updateJobStatus(jobId, 'completed', { logger })
      return { resumePoint }
    }

    const result = await this.runWithText(job.novelId, novelText, {
      existingJobId: jobId,
      title: novel.title || undefined,
    })

    logger.info('AnalyzePipeline.resumeJob: completed', {
      jobId,
      resumePoint,
      chunkCount: result.chunkCount,
    })

    return { resumePoint }
  }
}
