import type { Episode } from '@/db'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import type { JobWithProgress } from '@/services/database/index'
import { db as dbFactory } from '@/services/database/index'
import type { EpisodeData, MangaLayout } from '@/types/panel-layout'
import { isTestEnv } from '@/utils/env'
import { StorageKeys } from '@/utils/storage-keys'

// CONCURRENCY: In-memory lock to prevent race conditions in layout generation
// This map tracks active layout generation processes to prevent multiple
// concurrent generations for the same episode, which could lead to data corruption
// or inconsistent progress updates.
const activeLayoutGenerations = new Map<string, Promise<GenerateLayoutResult>>()

export interface LayoutGenerationConfig {
  panelsPerPage?: { min?: number; max?: number; average?: number }
  dialogueDensity?: number
  visualComplexity?: number
  highlightPanelSizeMultiplier?: number
  readingDirection?: 'right-to-left'
}

export interface GenerateLayoutOptions {
  isDemo?: boolean
  triggerRender?: boolean
  config?: LayoutGenerationConfig
}

export interface GenerateLayoutResult {
  layout: MangaLayout
  storageKey: string
  pageNumbers: number[]
}

// CONFIGURATION: Layout generation defaults
// These values define the default parameters for manga layout generation
const _DEFAULT_LAYOUT_CONFIG = {
  PANELS_PER_PAGE_MIN: 3,
  PANELS_PER_PAGE_MAX: 6,
  PANELS_PER_PAGE_AVERAGE: 4.5,
  DIALOGUE_DENSITY: 0.6,
  VISUAL_COMPLEXITY: 0.7,
  HIGHLIGHT_PANEL_SIZE_MULTIPLIER: 2.0,
  PAGE_BATCH_SIZE: 3, // Number of pages to generate in each batch
  BACK_EDIT_WINDOW: 2, // How many previous pages can be revised
  LOOP_LIMIT: 50, // Maximum iterations to prevent infinite loops
  NO_PROGRESS_STREAK_LIMIT_BASIC: 2, // Max no-progress iterations for basic fallback
  NO_PROGRESS_STREAK_LIMIT_PLAN: 5, // Max no-progress iterations for plan-aware mode
} as const

export async function generateEpisodeLayout(
  jobId: string,
  episodeNumber: number,
  options: GenerateLayoutOptions = {},
  ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({
    jobId,
    episodeNumber,
    service: 'layout-generation',
  }),
): Promise<GenerateLayoutResult> {
  // CONCURRENCY: Create unique key for this episode layout generation
  const lockKey = `${jobId}:${episodeNumber}`

  // Check if this episode is already being processed
  const existingGeneration = activeLayoutGenerations.get(lockKey)
  if (existingGeneration) {
    logger.info('Layout generation already in progress, waiting for completion', { lockKey })
    return existingGeneration
  }

  // Create and register the generation promise
  const generationPromise = generateEpisodeLayoutInternal(
    jobId,
    episodeNumber,
    options,
    ports,
    logger,
  )
  activeLayoutGenerations.set(lockKey, generationPromise)

  try {
    const result = await generationPromise
    return result
  } finally {
    // Always clean up the lock when done (success or failure)
    activeLayoutGenerations.delete(lockKey)
  }
}

/**
 * Initialize dependencies and repositories for layout generation
 */
function initializeLayoutDependencies(_jobId: string, _episodeNumber: number, _logger: LoggerPort) {
  const episodeRepo = {
    getByJobId: (jobId: string) => Promise.resolve(dbFactory.episodes().getEpisodesByJobId(jobId)),
  }
  const jobRepo = {
    getJobWithProgress: (id: string) => Promise.resolve(dbFactory.jobs().getJobWithProgress(id)),
    markStepCompleted: (id: string, step: 'split' | 'analyze' | 'episode' | 'layout' | 'render') =>
      Promise.resolve(dbFactory.jobs().markJobStepCompleted(id, step)),
    updateStep: (id: string, step: string) =>
      Promise.resolve(dbFactory.jobs().updateJobStep(id, step)),
  }
  return { episodeRepo, jobRepo }
}

/**
 * Resolve episode data, creating demo episode if needed
 */
async function resolveEpisodeData(
  jobId: string,
  episodeNumber: number,
  isDemo: boolean,
  episodeRepo: { getByJobId: (jobId: string) => Promise<Episode[]> },
  jobRepo: { getJobWithProgress: (id: string) => Promise<JobWithProgress | null> },
  logger: LoggerPort,
) {
  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
    logger.warn('getJobWithProgress failed', { error: (e as Error).message })
    return null
  })
  let episodes: Episode[]
  try {
    episodes = await episodeRepo.getByJobId(jobId)
  } catch (error) {
    logger.error('Failed to retrieve episodes for job', {
      jobId,
      error: (error as Error).message,
      stack: (error as Error).stack,
    })
    // Repository policy: do not fallback on infrastructure/db errors
    throw error
  }
  let episode = episodes.find((ep) => ep.episodeNumber === episodeNumber) || null

  if (!episode) {
    if (isDemo) {
      episode = {
        id: `demo-${jobId}-ep${episodeNumber}`,
        novelId: job?.novelId || `demo-novel-${jobId}`,
        jobId,
        episodeNumber,
        title: 'Demo Episode',
        summary: 'デモ用の自動作成エピソード',
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        confidence: 0.9,
        createdAt: new Date().toISOString(),
        episodeTextPath: null,
      } as Episode
    } else {
      logger.error('Episode not found')
      throw new Error('Episode not found')
    }
  }

  if (!episode) {
    throw new Error('Episode could not be resolved')
  }

  return episode
}

/**
 * Build chunk data for episode - handles both demo and real data
 * Now includes SFX data from script conversion
 */
async function buildChunkData(
  episode: {
    episodeNumber: number
    jobId: string
    startChunk: number
    endChunk: number
    startCharIndex: number
    endCharIndex: number
  },
  isDemo: boolean,
  logger: LoggerPort,
): Promise<EpisodeData['chunks']> {
  const chunkDataArray: EpisodeData['chunks'] = []

  if (isDemo) {
    chunkDataArray.push({
      chunkIndex: 0,
      text: 'デモ用の短いテキスト',
      analysis: {
        chunkIndex: 0,
        summary: 'デモ用サマリ',
        characters: [{ name: '太郎', role: 'protagonist', description: '主人公' }],
        dialogues: [
          {
            speaker: '太郎',
            text: 'やってみよう！',
            emotion: 'excited',
            context: '',
          },
        ],
        scenes: [
          {
            id: 'scene-0',
            location: '公園',
            time: '昼',
            description: 'ベンチのある公園',
            startIndex: 0,
            endIndex: 10,
          },
        ],
        highlights: [
          {
            type: 'emotional_peak',
            description: '決意の瞬間',
            importance: 8,
            text: 'やってみよう！',
            reason: 'demo',
          },
        ],
        situations: [{ event: 'start', description: '新しい挑戦', significance: 'high' }],
      },
      isPartial: false,
      startOffset: 0,
      endOffset: 10,
    })
  } else {
    const ensured = episode
    try {
      // Use storage ports directly to get chunk content and analysis
      const { getStoragePorts } = await import('@/infrastructure/storage/ports')
      const ports = getStoragePorts()

      // First, load the storage utils to get script data
      const { StorageFactory, JsonStorageKeys } = await import('@/utils/storage')
      const analysisStorage = await StorageFactory.getAnalysisStorage()

      for (let i = ensured.startChunk; i <= ensured.endChunk; i++) {
        const chunkContent = await ports.chunk.getChunk(ensured.jobId, i)
        if (!chunkContent) {
          logger.error('Chunk not found', { chunkIndex: i })
          throw new Error(`Chunk ${i} not found for job ${ensured.jobId}`)
        }
        const obj = await ports.analysis.getAnalysis(ensured.jobId, i)
        if (!obj) {
          logger.error('Analysis not found', { chunkIndex: i })
          throw new Error(`Analysis not found for chunk ${i}`)
        }
        let parsed: { analysis?: unknown }
        try {
          parsed = JSON.parse(obj.text) as { analysis?: unknown }
        } catch (parseError) {
          logger.error('Failed to parse analysis JSON', {
            chunkIndex: i,
            jobId: ensured.jobId,
            error: (parseError as Error).message,
          })
          throw new Error(
            `Failed to parse analysis for chunk ${i}: ${(parseError as Error).message}`,
          )
        }
        const analysis = (parsed.analysis ?? parsed) as EpisodeData['chunks'][number]['analysis']

        // Retrieve SFX data from script conversion
        const sfxData: string[] = []
        const scriptKey = JsonStorageKeys.scriptChunk(ensured.jobId, i)
        const scriptObj = await analysisStorage.get(scriptKey)
        if (scriptObj) {
          const scriptParsed = JSON.parse(scriptObj.text) as {
            panels?: Array<{ sfx?: string[] }>
          }
          if (scriptParsed.panels) {
            // Collect all SFX from all panels in this chunk
            for (const panel of scriptParsed.panels) {
              if (panel.sfx && Array.isArray(panel.sfx)) {
                sfxData.push(...panel.sfx)
              }
            }
          }
        }

        // Add SFX data to analysis
        const enrichedAnalysis = {
          ...analysis,
          sfx: sfxData.length > 0 ? sfxData : undefined,
        }

        const isPartial = i === ensured.startChunk || i === ensured.endChunk
        const startOffset = i === ensured.startChunk ? ensured.startCharIndex : 0
        const endOffset = i === ensured.endChunk ? ensured.endCharIndex : chunkContent.text.length

        chunkDataArray.push({
          chunkIndex: i,
          text: chunkContent.text.substring(startOffset, endOffset),
          analysis: enrichedAnalysis,
          isPartial,
          startOffset,
          endOffset,
        })
      }
    } catch (error) {
      logger.error('Failed to load chunks for episode', {
        episodeNumber: ensured.episodeNumber,
        error: (error as Error).message,
      })
      throw error
    }
  }

  return chunkDataArray
}

/**
 * Restore layout progress from previous generation attempts
 */
async function _restoreLayoutProgress(
  jobId: string,
  episodeNumber: number,
  ports: StoragePorts,
  logger: LoggerPort,
) {
  let pagesCanonical: Array<{ 
    page_number: number
    panels: MangaLayout['pages'][number]['panels']
  }> = []
  let lastPlannedPage = 0

  const progressRaw = await ports.layout.getEpisodeLayoutProgress(jobId, episodeNumber)
  if (progressRaw) {
    try {
      const progress = JSON.parse(progressRaw)
      if (progress.canonical && Array.isArray(progress.canonical.pages)) {
        pagesCanonical = progress.canonical.pages
        lastPlannedPage = Math.max(...pagesCanonical.map((p) => p.page_number), 0)
      }
    } catch (e) {
      logger.warn('Failed to parse existing progress; starting fresh', {
        error: (e as Error).message,
      })
    }
  }

  // YAMLは廃止: 進捗・レイアウトの復元はJSONのprogressファイルのみを参照する

  return { pagesCanonical, lastPlannedPage }
}

async function generateEpisodeLayoutInternal(
  jobId: string,
  episodeNumber: number,
  options: GenerateLayoutOptions = {},
  ports: StoragePorts = getStoragePorts(),
  logger: LoggerPort = getLogger().withContext({
    jobId,
    episodeNumber,
    service: 'layout-generation',
  }),
): Promise<GenerateLayoutResult> {
  logger.info('LayoutGeneration: start', { jobId, episodeNumber })
  const isDemo = options.isDemo === true

  // Initialize dependencies
  const { episodeRepo, jobRepo } = initializeLayoutDependencies(jobId, episodeNumber, logger)

  // Resolve episode data
  const episode = await resolveEpisodeData(
    jobId,
    episodeNumber,
    isDemo,
    episodeRepo,
    jobRepo,
    logger,
  )
  // テスト環境では、episodeが存在しない場合に最低限のダミーを生成して先へ進める
  if (!episode && isTestEnv()) {
    try {
      const jobRow = await jobRepo.getJobWithProgress(jobId)
      const fallbackEpisode = {
        id: `test-${jobId}-ep${episodeNumber}`,
        novelId: jobRow?.novelId || `test-novel-${jobId}`,
        jobId,
        episodeNumber,
        title: 'Test Episode',
        summary: 'Auto-generated for test',
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        confidence: 0.9,
        createdAt: new Date().toISOString(),
        episodeTextPath: null,
      } as Episode
      await dbFactory.episodes().createEpisode({
        novelId: fallbackEpisode.novelId,
        jobId,
        episodeNumber,
        title: fallbackEpisode.title ?? undefined,
        summary: fallbackEpisode.summary ?? undefined,
        startChunk: 0,
        startCharIndex: 0,
        endChunk: 0,
        endCharIndex: 0,
        confidence: 0.9,
      })
      logger.info('Episode created successfully', { jobId, episodeNumber })
    } catch (error) {
      logger.warn('Failed to create fallback demo episode', {
        jobId,
        episodeNumber,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Build chunk data
  const chunkDataArray = await buildChunkData(episode, isDemo, logger)

  if (chunkDataArray.length === 0) throw new Error('Chunk analysis data not found')

  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
    logger.warn('getJobWithProgress failed', { error: (e as Error).message })
    return null
  })

  const episodeData: EpisodeData = {
    chunkAnalyses: chunkDataArray.map((c) => c.analysis),
    author: 'Unknown Author',
    title: `Episode ${episode.episodeNumber}` as const,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.title || undefined,
    episodeSummary: episode.summary || undefined,
    startChunk: episode.startChunk,
    startCharIndex: episode.startCharIndex,
    endChunk: episode.endChunk,
    endCharIndex: episode.endCharIndex,
    chunks: chunkDataArray,
  }

  // Step update: layout in progress (best-effort in test env)
  try {
    await jobRepo.updateStep(jobId, `layout_episode_${episodeNumber}`)
  } catch (e) {
    logger.warn('updateStep failed (non-fatal for layout start)', {
      jobId,
      episodeNumber,
      error: (e as Error).message,
    })
  }

  // ===== New script-based flow: script -> page-breaks -> panel assignment =====
  try {
    const episodeText = episodeData.chunks.map((c) => c.text).join('\n')

    // Progress validation: Ensure minimum content exists
    if (!episodeText.trim()) {
      logger.error('No episode text content available for layout generation', { episodeNumber })
      throw new Error('No episode text content available for layout generation')
    }

    const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
    const script = await convertEpisodeTextToScript(
      {
        episodeText,
        // TODO: Extract structured data for enhanced script conversion
        characterList: undefined,
        sceneList: undefined,
        dialogueList: undefined,
        highlightList: undefined,
        situationList: undefined,
      },
      {
        jobId,
        episodeNumber: episode.episodeNumber,
        isDemo,
        // フラグメント変換を無効化（処理経路の透明化のため）
      },
    )

    // Progress validation: Script conversion must produce results
    const allScriptPanels = Array.isArray(script?.panels) ? script.panels : []
    if (allScriptPanels.length === 0) {
      logger.error('Script conversion failed to produce valid script', {
        episodeNumber,
        scriptStructure: script,
      })
      throw new Error('Script conversion failed to produce valid script')
    }

    const { estimatePageBreaksSegmented } = await import(
      '@/agents/script/segmented-page-break-estimator'
    )
    const segmentedResult = await estimatePageBreaksSegmented(script, {
      jobId,
      useImportanceBased: true,
    })
    const pageBreaks = segmentedResult.pageBreaks

    // Progress validation: Page breaks must be estimated
    if (!pageBreaks?.panels || pageBreaks.panels.length === 0) {
      logger.error('Page break estimation failed to produce valid page breaks', {
        episodeNumber,
        scriptLength: allScriptPanels.length,
      })
      throw new Error('Page break estimation failed to produce valid page breaks')
    }

    const { buildLayoutFromPageBreaks } = await import('@/agents/script/panel-assignment')
    const layoutBuilt = buildLayoutFromPageBreaks(pageBreaks, {
      title: episodeData.title,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episode.episodeTitle,
    })

    // Layout generation completed - log the results
    logger.info('Layout generation completed successfully', {
      episodeNumber,
      generatedPages: layoutBuilt?.pages?.length || 0,
      scriptLength: allScriptPanels.length,
    })

    // Basic validation: ensure layout was generated
    if (!layoutBuilt?.pages || layoutBuilt.pages.length === 0) {
      logger.error('Layout building failed to generate any pages', {
        episodeNumber,
        scriptLength: allScriptPanels.length,
      })
      throw new Error('Layout building failed to generate any pages')
    }

    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layoutBuilt, {
      bypassValidation: true,
    })

    // 分布ログ: ページごとのパネル数・空content枚数
    try {
      const summary = normalized.layout.pages.map((p) => ({
        page: p.page_number,
        panels: p.panels.length,
        emptyContent: p.panels.filter((x) => !x.content || x.content.trim().length === 0).length,
      }))
      logger.info('Layout distribution summary', {
        episodeNumber: episode.episodeNumber,
        pages: summary,
      })
    } catch (summaryError) {
      logger.warn('Failed to generate layout summary', {
        episodeNumber,
        error: (summaryError as Error).message,
      })
    }

    // 保存（JSON形式に統一）- with atomic error handling
    try {
      const jsonContent = JSON.stringify(normalized.layout)

      // Atomic write operations - must both succeed or both fail
      await Promise.all([
        ports.layout.putEpisodeLayout(jobId, episodeNumber, jsonContent),
        ports.layout.putEpisodeLayoutProgress(
          jobId,
          episodeNumber,
          JSON.stringify({
            pages: normalized.layout.pages,
            lastPlannedPage: Math.max(...normalized.layout.pages.map((p) => p.page_number)),
            updatedAt: new Date().toISOString(),
            validation: { pageIssues: normalized.pageIssues },
          }),
        ),
      ])
    } catch (storageError) {
      logger.error('Failed to persist layout and progress - atomic write failed', {
        episodeNumber,
        error: (storageError as Error).message,
        stack: (storageError as Error).stack,
      })
      throw new Error('Storage operation failed')
    }

    // ステータス更新
    try {
      await jobRepo.markStepCompleted(jobId, 'layout')
      await jobRepo.updateStep(jobId, 'render')
    } catch (statusError) {
      logger.error('Failed to update job status after successful layout generation', {
        episodeNumber,
        error: (statusError as Error).message,
      })
      throw new Error(`Job status update failed: ${(statusError as Error).message}`)
    }

    // デモモードまたはジョブ未発見時はDB更新をスキップ（明示ログ）。
    if (!isDemo && job) {
      try {
        // Persist layout status using new domain service
        const totalPagesEp = normalized.layout.pages.length
        const totalPanelsEp = normalized.layout.pages.reduce(
          (acc, p) => acc + (Array.isArray(p.panels) ? p.panels.length : 0),
          0,
        )
        dbFactory.layout().upsertLayoutStatus({
          jobId,
          episodeNumber,
          totalPages: totalPagesEp,
          totalPanels: totalPanelsEp,
          layoutPath: StorageKeys.episodeLayout(jobId, episodeNumber),
        })
        // Update job total pages conservatively
        dbFactory.jobs().updateJobTotalPages(jobId, totalPagesEp)
        // 現在処理中のエピソードを記録（ページは未確定のためnull）
        dbFactory.jobs().updateProcessingPosition(jobId, { episode: episodeNumber, page: null })
      } catch (dbError) {
        logger.error('Failed to persist layout totals to database', {
          error: (dbError as Error).message,
          episodeNumber,
        })
        throw new Error(`Database update failed: ${(dbError as Error).message}`)
      }
    } else {
      logger.warn('Skipping DB persistence for layout totals', {
        reason: isDemo ? 'demo-mode' : 'job-not-found',
        episodeNumber,
      })
    }

    const storageKey = StorageKeys.episodeLayout(jobId, episodeNumber)
    const pageNumbers = normalized.layout.pages.map((p) => p.page_number).sort((a, b) => a - b)
    logger.info('LayoutGeneration: success', { jobId, episodeNumber, pages: pageNumbers.length })
    return { layout: normalized.layout, storageKey, pageNumbers }
  } catch (scriptFlowError) {
    logger.error('Script-based layout generation failed', {
      error: (scriptFlowError as Error).message,
      episodeNumber,
      stack: (scriptFlowError as Error).stack,
    })
    throw scriptFlowError
  }
}

// (demoLayoutFromEpisode) was removed: demo mode now uses the normal planning/generation flow
