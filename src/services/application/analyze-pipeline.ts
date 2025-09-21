import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'

// repositories shim no longer used
// import { db } from '@/services/database/index'  // 直接のインポートを削除

// Remove ScriptMergeStep and TextAnalysisStepV2 usage
// import { ScriptMergeStep } from './steps/script-merge-step'
// import { type AnalysisResult, TextAnalysisStep as TextAnalysisStepV2 } from './steps/text-analysis-step-v2'
import type { NewMangaScript } from '@/types/script'
// Import pipeline steps
import {
  BasePipelineStep,
  CompletionStep,
  JobManagementStep,
  NovelManagementStep,
  PageBreakStep,
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
 * フロー: チャンク分割 → scriptConversion → episodeBreakEstimation → layout → render
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
  private readonly pageBreakStep = new PageBreakStep()
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

  // 旧: TextAnalysis は完全撤去（オプション isDemo に関わらずスキップ）
  // 互換のため analyze ステップの開始/完了フラグは維持する
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

    // analyze ステップ完了を明示
    await this.markStepCompleted(jobId, 'analyze', { logger })

    // UI遷移の空白対策: ここで currentStep=episode をセット
    await this.updateJobStep(jobId, 'episode', { logger }, 0, 4)
    await new Promise((resolve) => setTimeout(resolve, 300))

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

      const { buildPanelToChunkMapping, getChunkForPanel } = await import(
        '@/services/application/panel-to-chunk-mapping'
      )
      const panelToChunkMapping = await buildPanelToChunkMapping(
        context.novelId,
        jobId,
        totalChunks,
        logger,
      )

      const { EpisodeWriteService } = await import('@/services/application/episode-write')
      const episodeWriter = new EpisodeWriteService()
      const episodesForDb = episodeRes.data.episodeBreaks.episodes.map((ep) => {
        const startChunk = getChunkForPanel(panelToChunkMapping, ep.startPanelIndex)
        const endChunk = getChunkForPanel(panelToChunkMapping, ep.endPanelIndex)

        return {
          novelId: job.novelId,
          jobId,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          summary: undefined,
          startChunk,
          startCharIndex: 0,
          endChunk,
          endCharIndex: 0,
          confidence: 1,
        }
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

    // importance-based ページ割り（既存の PageBreakStep を利用してレイアウトとステータスを永続化）
    const pbRes = await this.pageBreakStep.estimatePageBreaks(
      combinedScript,
      episodeRes.data.episodeBreaks,
      context,
    )
    if (!pbRes.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, pbRes.error)
      throw new Error(pbRes.error)
    }

    const episodeNumbers = episodeRes.data.episodeBreaks.episodes.map((ep) => ep.episodeNumber)
    const totalPages = pbRes.data?.totalPages ?? 0
    await this.updateJobTotalPages(jobId, totalPages, { logger })
    await this.markStepCompleted(jobId, 'layout', { logger })

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
