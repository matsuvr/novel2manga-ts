import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getJobRepository, getNovelRepository } from '@/repositories'
import { getDatabaseService } from '@/services/db-factory'

// Import pipeline steps
import {
  type AnalysisResult,
  BasePipelineStep,
  CompletionStep,
  JobManagementStep,
  NovelManagementStep,
  PageBreakStep,
  RenderingStep,
  type StepContext,
  type StepExecutionResult,
  TextAnalysisStep,
  TextChunkingStep,
} from './steps'
import { ChunkScriptStep } from './steps/chunk-script-step'
import { EpisodeBreakEstimationStep } from './steps/episode-break-estimation-step'
import { ScriptMergeStep } from './steps/script-merge-step'

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
 * 責務: 小説テキストの分析からレイアウト生成・レンダリングまでの一連の処理
 * フロー: チャンク分割 → textAnalysis → narrativeArcAnalysis → scriptConversion → pageBreakEstimation → layout → render
 *
 * 使用箇所: /api/analyze (プロダクションメインエンドポイント)
 * テスト: src/__tests__/integration/service-integration.test.ts など多数
 *
 * Note: Orchestrator (scenario.ts) とは異なる責務を持つ
 * - AnalyzePipeline: ビジネスロジックの順序を定義。実際のロジックは個別のステップクラスに実装されている
 * - Orchestrator: APIチェーンの実行エンジン（開発・デモ用）
 *
 * 重要: このファイルでは「どこで何を I/O するか／LLM を呼ぶか」を日本語コメントで明示しています。
 * - 「ファイル/ストレージへ書き込む/読み込む」
 * - 「DB（D1/Drizzle 経由）へ書き込む/読み込む」
 * - 「LLM へプロンプトを渡す（呼び出す）」
 * を見つけやすくするため、各該当箇所の直前にコメントを追加しています。
 */
export class AnalyzePipeline extends BasePipelineStep {
  readonly stepName = 'analyze-pipeline'

  private readonly novelStep = new NovelManagementStep()
  private readonly jobStep = new JobManagementStep()
  private readonly chunkingStep = new TextChunkingStep()
  private readonly analysisStep = new TextAnalysisStep()
  // 新フローでは物語弧/旧エピソード抽出を使用しない
  // private readonly narrativeStep = new NarrativeAnalysisStep()
  // private readonly scriptStep = new ScriptConversionStep()
  private readonly chunkScriptStep = new ChunkScriptStep()
  private readonly scriptMergeStep = new ScriptMergeStep()
  private readonly episodeBreakStep = new EpisodeBreakEstimationStep()
  private readonly pageBreakStep = new PageBreakStep()
  private readonly renderingStep = new RenderingStep()
  private readonly completionStep = new CompletionStep()

  constructor(
    private readonly ports: StoragePorts = getStoragePorts(),
    // keep optional logger for future detailed tracing without lint noise
    _logger: LoggerPort = getLogger().withContext({
      service: 'analyze-pipeline',
    }),
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

    // Text analysis step (skip in demo mode to speed up tests and demos)
    const analysisResult: StepExecutionResult<AnalysisResult> = options.isDemo
      ? { success: true, data: { completed: true } }
      : await this.analysisStep.analyzeChunks(chunks, existingJob || null, context)
    if (!analysisResult.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, analysisResult.error)
      throw new Error(analysisResult.error)
    }

    // Mark analysis step as completed if not already done
    if (!existingJob?.analyzeCompleted) {
      await this.markStepCompleted(jobId, 'analyze', { logger })
    }

    // 新フロー: チャンクごと台本化 → 台本統合 → ページ割り（全体） → 束ね → レンダ
    // チャンク台本化
    const chunkScriptRes = await this.chunkScriptStep.convertChunksToScripts(chunks, context)
    if (!chunkScriptRes.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, chunkScriptRes.error)
      throw new Error(chunkScriptRes.error)
    }
    // 台本統合
    const mergeRes = await this.scriptMergeStep.mergeChunkScripts(totalChunks, context)
    if (!mergeRes.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, mergeRes.error)
      throw new Error(mergeRes.error)
    }

    // Store coverage warnings if any
    if (mergeRes.data.coverageWarnings && mergeRes.data.coverageWarnings.length > 0) {
      await this.updateJobCoverageWarnings(jobId, mergeRes.data.coverageWarnings, { logger })
    }

    // エピソード分割ステップを明示
    // UIとSSEで「エピソード構成」がスキップに見えないように、
    // ここで currentStep=episode をセットし、完了時に markStepCompleted する。
    await this.updateJobStep(jobId, 'episode', { logger }, 0, 0)

    // 統合台本を読み出してページ割り
    const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
    const analysisStorage = await StorageFactory.getAnalysisStorage()
    const combinedText = await analysisStorage.get(JsonStorageKeys.scriptCombined(jobId))
    if (!combinedText) {
      throw new Error('Combined script not found')
    }
    const combinedScript = JSON.parse(combinedText.text)

    // エピソード切れ目検出
    const episodeRes = await this.episodeBreakStep.estimateEpisodeBreaks(combinedScript, context)
    if (!episodeRes.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, episodeRes.error)
      throw new Error(episodeRes.error)
    }

    // エピソード境界をDBへ永続化（最小フィールドでのアップサート）
    try {
      const jobRepo = getJobRepository()
      const job = await jobRepo.getJob(jobId)
      if (!job) throw new Error(`Job not found for episode persistence: ${jobId}`)

      // パネル→チャンクマッピングを作成
      const panelToChunkMapping = await this.buildPanelToChunkMapping(jobId, totalChunks, {
        logger,
      })

      const { EpisodeWriteService } = await import('@/services/application/episode-write')
      const episodeWriter = new EpisodeWriteService()
      const episodesForDb = episodeRes.data.episodeBreaks.episodes.map((ep) => {
        // パネル範囲からチャンク範囲を計算
        const startChunk = this.getChunkForPanel(panelToChunkMapping, ep.startPanelIndex)
        const endChunk = this.getChunkForPanel(panelToChunkMapping, ep.endPanelIndex)

        return {
          novelId: job.novelId,
          jobId,
          episodeNumber: ep.episodeNumber,
          title: ep.title,
          summary: undefined,
          // 計算されたチャンク範囲を保存
          startChunk,
          startCharIndex: 0,
          endChunk,
          endCharIndex: 0,
          confidence: 1,
        }
      })
      await episodeWriter.bulkUpsert(episodesForDb)
      try {
        const db = getDatabaseService()
        const persisted = await db.getEpisodesByJobId(jobId)
        logger.info('Episode persistence summary', {
          jobId,
          requested: episodesForDb.length,
          persisted: persisted.length,
        })

        // Early failure detection: Check episode persistence integrity
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
          // Re-throw early failure errors
          throw e
        }
        logger.warn('Episode persistence summary failed', {
          jobId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
      // エピソード構成を完了にマーク
      await this.markStepCompleted(jobId, 'episode', { logger })

      // レイアウト段階の進捗開始（ここからはレイアウト処理）
      await this.updateJobStep(jobId, 'layout', { logger }, totalChunks, totalChunks)
    } catch (persistEpisodesError) {
      await this.updateJobStatus(jobId, 'failed', { logger }, String(persistEpisodesError))
      throw persistEpisodesError
    }

    // importance-basedページ割り
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

    // レンダ
    // 注意: 第4引数はチャンク総数専用。ページ総数はjobs.total_pagesに保存済みのため渡さない
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

    // 強制整合性チェック: エピソードがDBに永続化されていない場合は完了扱いにしない
    try {
      logger.info('Running job completion integrity check', {
        jobId,
        expectedEpisodes: episodeNumbers.length,
      })
      const db = getDatabaseService()
      const epCount = await db.recomputeJobProcessedEpisodes(jobId)
      if (epCount === 0) {
        // Collect detailed diagnostic information for troubleshooting
        const diagInfo = {
          episodesCount: 0,
          layoutFileCount: 0,
          layoutStatusCount: 0,
          storageError: null as string | null,
        }

        try {
          // Get episodes count
          const episodes = await db.getEpisodesByJobId(jobId)
          diagInfo.episodesCount = episodes.length

          // Get layout_status count (use public method since db.db is private)
          // For now, use the same logic as recomputeJobProcessedEpisodes to get count
          diagInfo.layoutStatusCount = epCount // We already computed this above

          // Check storage layout files
          const { StorageFactory, StorageKeys } = await import('@/utils/storage')
          const storage = await StorageFactory.getLayoutStorage()
          for (const ep of episodes) {
            const layoutKey = StorageKeys.episodeLayout(jobId, ep.episodeNumber)
            const layoutExists = await storage.get(layoutKey)
            if (layoutExists?.text) {
              diagInfo.layoutFileCount++
            }
          }
        } catch (diagError) {
          diagInfo.storageError = diagError instanceof Error ? diagError.message : String(diagError)
        }

        // デモモードでのスキップ理由を明確化
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
    logger.info('AnalyzePipeline.runWithText: completed (new flow)', {
      jobId,
      chunkCount: totalChunks,
    })
    return { jobId, chunkCount: totalChunks, response: completionResult.data.response }
  }

  async resumeJob(jobId: string): Promise<{ resumePoint: string }> {
    const logger = getLogger().withContext({ service: 'analyze-pipeline' })
    logger.info('AnalyzePipeline.resumeJob: start', { jobId })

    const jobRepo = getJobRepository()
    const novelRepo = getNovelRepository()

    // ジョブの現在の状態を取得
    const job = await jobRepo.getJob(jobId)
    if (!job) {
      throw new Error(`Job not found: ${jobId}`)
    }

    // 小説データを取得
    const novel = await novelRepo.get(job.novelId)
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

    // 実際の完了状態を確認 - status が completed でも、すべてのステップが完了していない場合は再開可能
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

    // status が completed だが実際には完了していない場合、statusを processing に戻す
    if (job.status === 'completed' && !isActuallyCompleted) {
      logger.warn('Job marked as completed but steps incomplete, resetting status to processing', {
        jobId,
        splitCompleted: job.splitCompleted,
        analyzeCompleted: job.analyzeCompleted,
        episodeCompleted: job.episodeCompleted,
        layoutCompleted: job.layoutCompleted,
        renderCompleted: job.renderCompleted,
      })
      await jobRepo.updateStatus(
        jobId,
        'processing',
        'Status reset - incomplete steps detected during resume',
      )
    }

    // 小説テキストを取得（ストレージから読み込み）
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

    // 処理を再開
    // まず、何のステップから再開すべきかを判定
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
      await jobRepo.updateStatus(jobId, 'completed')
      return { resumePoint }
    }

    // 既存のジョブIDを使って処理を再開
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

  /**
   * パネル→チャンクマッピングを作成
   * 各チャンクのパネル数を元に、パネルインデックス範囲を計算
   */
  private async buildPanelToChunkMapping(
    jobId: string,
    totalChunks: number,
    context: { logger: ReturnType<typeof import('@/infrastructure/logging/logger').getLogger> },
  ): Promise<Array<{ chunkIndex: number; startPanel: number; endPanel: number }>> {
    const { logger } = context
    const mapping: Array<{ chunkIndex: number; startPanel: number; endPanel: number }> = []
    let currentPanelIndex = 1 // パネルは1から始まる

    const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
    const storage = await StorageFactory.getAnalysisStorage()

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const key = JsonStorageKeys.scriptChunk(jobId, chunkIndex)
      const obj = await storage.get(key)

      if (!obj) {
        logger.warn('Missing script chunk for panel mapping', { jobId, chunkIndex })
        continue
      }

      let panelCount = 0
      try {
        const scriptObj = JSON.parse(obj.text)
        panelCount = Array.isArray(scriptObj.panels) ? scriptObj.panels.length : 0
      } catch (_parseError) {
        logger.warn('Failed to parse script chunk for panel mapping', { jobId, chunkIndex })
        continue
      }

      if (panelCount > 0) {
        const startPanel = currentPanelIndex
        const endPanel = currentPanelIndex + panelCount - 1
        mapping.push({
          chunkIndex,
          startPanel,
          endPanel,
        })
        currentPanelIndex = endPanel + 1
      }
    }

    logger.info('Built panel to chunk mapping', {
      jobId,
      totalMappings: mapping.length,
      totalPanels: currentPanelIndex - 1,
    })

    return mapping
  }

  /**
   * パネルインデックスに対応するチャンクインデックスを取得
   */
  private getChunkForPanel(
    mapping: Array<{ chunkIndex: number; startPanel: number; endPanel: number }>,
    panelIndex: number,
  ): number {
    const chunk = mapping.find((m) => panelIndex >= m.startPanel && panelIndex <= m.endPanel)
    return chunk ? chunk.chunkIndex : 0 // フォールバック値として0を返す
  }
}
