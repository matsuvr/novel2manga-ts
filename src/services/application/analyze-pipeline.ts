import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { getJobRepository, getNovelRepository } from '@/repositories'
import type { EpisodeBoundary } from '@/types/episode'

// Import pipeline steps
import {
  BasePipelineStep,
  CompletionStep,
  EpisodeProcessingStep,
  JobManagementStep,
  NarrativeAnalysisStep,
  NovelManagementStep,
  PageBreakStep,
  RenderingStep,
  ScriptConversionStep,
  type StepContext,
  TextAnalysisStep,
  TextChunkingStep,
} from './steps'

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
  private readonly narrativeStep = new NarrativeAnalysisStep()
  private readonly episodeStep = new EpisodeProcessingStep()
  private readonly scriptStep = new ScriptConversionStep()
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

    // Text analysis step
    const analysisResult = await this.analysisStep.analyzeChunks(
      chunks,
      existingJob || null,
      context,
    )
    if (!analysisResult.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, analysisResult.error)
      throw new Error(analysisResult.error)
    }

    // Mark analysis step as completed if not already done
    if (!existingJob?.analyzeCompleted) {
      await this.markStepCompleted(jobId, 'analyze', { logger })
    }

    // Narrative analysis step
    const narrativeResult = await this.narrativeStep.analyzeNarrativeArc(context)
    if (!narrativeResult.success) {
      await this.updateJobStatus(jobId, 'failed', { logger }, narrativeResult.error)
      throw new Error(narrativeResult.error)
    }

    const { boundaries, hasBoundaries } = narrativeResult.data

    // Episode processing - only if boundaries were detected
    if (hasBoundaries) {
      logger.info('Episode boundaries detected, starting episode processing', {
        jobId,
        boundariesCount: boundaries.length,
        episodeNumbers: boundaries.map((b) => b.episodeNumber),
      })

      // Mark episode step as completed
      await this.markStepCompleted(jobId, 'episode', { logger })

      // Initialize layout step
      await this.updateJobStep(jobId, 'layout', { logger }, totalChunks, totalChunks)

      // Process each episode
      const episodeNumbers = boundaries.map((b) => b.episodeNumber).sort((a, b) => a - b)
      logger.info('Starting episode processing loop', {
        jobId,
        episodeNumbers,
        totalEpisodes: episodeNumbers.length,
      })

      let totalPages = 0

      for (const episodeNumber of episodeNumbers) {
        logger.info('Processing episode', { jobId, episodeNumber })
        try {
          await this.processEpisode(episodeNumber, boundaries, context)

          // Get total pages from this episode's page break plan
          const pageBreakPlanText = await this.ports.layout.getEpisodeLayout(jobId, episodeNumber)
          if (pageBreakPlanText) {
            const pageBreakPlan = JSON.parse(pageBreakPlanText)
            if (pageBreakPlan?.pages && Array.isArray(pageBreakPlan.pages)) {
              totalPages += pageBreakPlan.pages.length
            } else {
              logger.warn('Invalid page break plan structure', {
                jobId,
                episodeNumber,
                pageBreakPlan,
              })
            }
          }
        } catch (episodeError) {
          const errorMessage =
            episodeError instanceof Error ? episodeError.message : String(episodeError)
          logger.error(
            'Episode processing failed - stopping entire job to maintain story integrity',
            {
              jobId,
              episodeNumber,
              error: errorMessage,
              stack: episodeError instanceof Error ? episodeError.stack : undefined,
              episodeNumbers,
              totalEpisodes: episodeNumbers.length,
              context: 'Episode processing failure',
            },
          )

          await this.updateJobStatus(
            jobId,
            'failed',
            { logger },
            `Episode ${episodeNumber} processing failed: ${errorMessage}. Story integrity requires all episodes to be processed successfully.`,
          )

          throw new Error(
            `Episode ${episodeNumber} processing failed: ${errorMessage}. Cannot skip episodes as it would break story integrity.`,
          )
        }
      }

      // Update total pages
      await this.updateJobTotalPages(jobId, totalPages, { logger })

      // Mark layout step as completed
      await this.markStepCompleted(jobId, 'layout', { logger })

      // Initialize render step
      await this.updateJobStep(jobId, 'render', { logger }, 0, totalPages)

      logger.info('Page break estimation completed for all episodes', {
        jobId,
        totalPages,
        episodeCount: episodeNumbers.length,
      })

      // Rendering step
      const renderingResult = await this.renderingStep.renderEpisodes(
        episodeNumbers,
        { isDemo: options.isDemo },
        context,
      )
      if (!renderingResult.success) {
        logger.error('Rendering failed', { jobId, error: renderingResult.error })
        // Don't fail the job for rendering errors in demo mode
        if (!options.isDemo) {
          throw new Error(renderingResult.error)
        }
      }

      // Mark render step as completed
      await this.markStepCompleted(jobId, 'render', { logger })

      // Complete the job
      await this.updateJobStep(jobId, 'complete', { logger })
      await this.updateJobStatus(jobId, 'completed', { logger })

      // Generate completion response
      const completionResult = await this.completionStep.completeJob(totalChunks, true, context)
      if (!completionResult.success) {
        throw new Error(completionResult.error)
      }

      logger.info('AnalyzePipeline.runWithText: completed', { jobId, chunkCount: totalChunks })
      return { jobId, chunkCount: totalChunks, response: completionResult.data.response }
    } else {
      // No episode boundaries detected → Fallback: treat full text as a single episode
      logger.warn('No episode boundaries detected, falling back to single-episode processing', {
        jobId,
        totalChunks,
      })

      // Episode step
      await this.markStepCompleted(jobId, 'episode', { logger })

      // Persist a synthetic single-episode boundary for export/UI compatibility
      try {
        const lastChunkIndex = Math.max(0, totalChunks - 1)
        let lastChunkLen = 0
        if (totalChunks > 0) {
          const lastChunkObj = await this.ports.chunk.getChunk(jobId, lastChunkIndex)
          lastChunkLen = typeof lastChunkObj?.text === 'string' ? lastChunkObj.text.length : 0
        } else {
          lastChunkLen = novelText.length
        }
        const { saveEpisodeBoundaries } = await import('@/utils/storage')
        await saveEpisodeBoundaries(jobId, [
          {
            episodeNumber: 1,
            title: options.title || 'Episode 1',
            summary: undefined as unknown as string | undefined,
            startChunk: 0,
            startCharIndex: 0,
            endChunk: lastChunkIndex,
            endCharIndex: lastChunkLen,
            confidence: 1,
          },
        ])
      } catch (persistError) {
        logger.warn('Failed to persist synthetic episode boundary (fallback continues)', {
          jobId,
          error: persistError instanceof Error ? persistError.message : String(persistError),
        })
      }

      // Initialize layout step for fallback
      await this.updateJobStep(jobId, 'layout', { logger }, totalChunks, totalChunks)

      const episodeNumber = 1

      // Convert full novel text to script directly (bypass DB episode boundaries)
      const scriptResult = await this.scriptStep.convertToScript(
        novelText,
        episodeNumber,
        [],
        context,
      )
      if (!scriptResult.success) {
        await this.updateJobStatus(jobId, 'failed', { logger }, scriptResult.error)
        throw new Error(scriptResult.error)
      }
      const { script } = scriptResult.data

      // Page breaks and layout storage
      const pageBreakResult = await this.pageBreakStep.estimatePageBreaks(
        script,
        episodeNumber,
        context,
      )
      if (!pageBreakResult.success) {
        await this.updateJobStatus(jobId, 'failed', { logger }, pageBreakResult.error)
        throw new Error(pageBreakResult.error)
      }

      if (!pageBreakResult.data) {
        const errorMessage = 'Page break result data is undefined'
        await this.updateJobStatus(jobId, 'failed', { logger }, errorMessage)
        throw new Error(errorMessage)
      }

      const totalPages = pageBreakResult.data.totalPages
      await this.updateJobTotalPages(jobId, totalPages, { logger })
      await this.markStepCompleted(jobId, 'layout', { logger })

      // Render
      await this.updateJobStep(jobId, 'render', { logger }, 0, totalPages)
      const renderingResult = await this.renderingStep.renderEpisodes(
        [episodeNumber],
        { isDemo: options.isDemo },
        context,
      )
      if (!renderingResult.success) {
        logger.error('Rendering failed (fallback)', { jobId, error: renderingResult.error })
        if (!options.isDemo) {
          throw new Error(renderingResult.error)
        }
      }
      await this.markStepCompleted(jobId, 'render', { logger })

      // Complete
      await this.updateJobStep(jobId, 'complete', { logger })
      await this.updateJobStatus(jobId, 'completed', { logger })

      const completionResult = await this.completionStep.completeJob(totalChunks, true, context)
      if (!completionResult.success) {
        throw new Error(completionResult.error)
      }

      logger.info('Job completed via single-episode fallback', { jobId, episodeNumber, totalPages })
      return { jobId, chunkCount: totalChunks, response: completionResult.data.response }
    }
  }

  private async processEpisode(
    episodeNumber: number,
    boundaries: EpisodeBoundary[],
    context: StepContext,
  ): Promise<void> {
    const { logger } = context

    // Extract episode text
    const episodeResult = await this.episodeStep.extractEpisodeText(
      episodeNumber,
      boundaries,
      context,
    )
    if (!episodeResult.success) {
      throw new Error(episodeResult.error)
    }

    const { episodeText, extractionMethod } = episodeResult.data
    logger.info('Episode text extracted successfully', {
      jobId: context.jobId,
      episodeNumber,
      episodeTextLength: episodeText.length,
      extractionMethod,
    })

    // Convert to script
    const scriptResult = await this.scriptStep.convertToScript(
      episodeText,
      episodeNumber,
      boundaries,
      context,
    )
    if (!scriptResult.success) {
      throw new Error(scriptResult.error)
    }

    const { script } = scriptResult.data

    // Generate page breaks
    const pageBreakResult = await this.pageBreakStep.estimatePageBreaks(
      script,
      episodeNumber,
      context,
    )
    if (!pageBreakResult.success) {
      throw new Error(pageBreakResult.error)
    }

    if (!pageBreakResult.data) {
      throw new Error('Page break result data is undefined')
    }

    logger.info('Episode processing completed', {
      jobId: context.jobId,
      episodeNumber,
      totalPages: pageBreakResult.data.totalPages,
    })
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
}
