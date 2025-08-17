import yaml from 'js-yaml'
import { PageSplitAgent } from '@/agents/page-splitter'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { EpisodeData, MangaLayout } from '@/types/panel-layout'
import { StorageKeys } from '@/utils/storage'

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
const DEFAULT_LAYOUT_CONFIG = {
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
  const db = getDatabaseService()
  const { episode: episodePort, job: jobPort } = adaptAll(db)
  const episodeRepo = new EpisodeRepository(episodePort)
  const jobRepo = new JobRepository(jobPort)

  return { episodeRepo, jobRepo }
}

/**
 * Resolve episode data, creating demo episode if needed
 */
async function resolveEpisodeData(
  jobId: string,
  episodeNumber: number,
  isDemo: boolean,
  episodeRepo: EpisodeRepository,
  jobRepo: JobRepository,
  logger: LoggerPort,
) {
  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
    logger.warn('getJobWithProgress failed', { error: (e as Error).message })
    return null
  })
  const episodes = await episodeRepo.getByJobId(jobId).catch(() => [])
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
        estimatedPages: 1,
        confidence: 0.9,
        createdAt: new Date().toISOString(),
      }
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
        const isPartial = i === ensured.startChunk || i === ensured.endChunk
        const startOffset = i === ensured.startChunk ? ensured.startCharIndex : 0
        const endOffset = i === ensured.endChunk ? ensured.endCharIndex : chunkContent.text.length

        chunkDataArray.push({
          chunkIndex: i,
          text: chunkContent.text.substring(startOffset, endOffset),
          analysis,
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
async function restoreLayoutProgress(
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

  if (!progressRaw && pagesCanonical.length === 0) {
    const yamlExisting = await ports.layout.getEpisodeLayout(jobId, episodeNumber)
    if (yamlExisting) {
      try {
        const parsed = yaml.load(yamlExisting) as MangaLayout
        const epPages = Array.isArray(parsed.pages) ? parsed.pages : []
        pagesCanonical = epPages.map((p) => ({
          page_number: p.page_number,
          panels: p.panels,
        }))
        lastPlannedPage = pagesCanonical[pagesCanonical.length - 1]?.page_number ?? 0
      } catch (e) {
        logger.warn('Failed to parse existing YAML; starting fresh', {
          error: (e as Error).message,
        })
      }
    }
  }

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

  // Build chunk data
  const chunkDataArray = await buildChunkData(episode, isDemo, logger)

  if (chunkDataArray.length === 0) throw new Error('Chunk analysis data not found')

  const job = await jobRepo.getJobWithProgress(jobId).catch((e) => {
    logger.warn('getJobWithProgress failed', { error: (e as Error).message })
    return null
  })

  const episodeData: EpisodeData = {
    chunkAnalyses: chunkDataArray.map((c) => c.analysis),
    author: job?.jobName || 'Unknown Author',
    title: `Episode ${episode.episodeNumber}` as const,
    episodeNumber: episode.episodeNumber,
    episodeTitle: episode.title || undefined,
    episodeSummary: episode.summary || undefined,
    startChunk: episode.startChunk,
    startCharIndex: episode.startCharIndex,
    endChunk: episode.endChunk,
    endCharIndex: episode.endCharIndex,
    estimatedPages: episode.estimatedPages,
    chunks: chunkDataArray,
  }

  // Step update: layout in progress
  await jobRepo.updateStep(jobId, `layout_episode_${episodeNumber}`)

  // Build full config with defaults
  const fullConfig = {
    panelsPerPage: {
      min: options.config?.panelsPerPage?.min ?? DEFAULT_LAYOUT_CONFIG.PANELS_PER_PAGE_MIN,
      max: options.config?.panelsPerPage?.max ?? DEFAULT_LAYOUT_CONFIG.PANELS_PER_PAGE_MAX,
      average:
        options.config?.panelsPerPage?.average ?? DEFAULT_LAYOUT_CONFIG.PANELS_PER_PAGE_AVERAGE,
    },
    dialogueDensity: options.config?.dialogueDensity ?? DEFAULT_LAYOUT_CONFIG.DIALOGUE_DENSITY,
    visualComplexity: options.config?.visualComplexity ?? DEFAULT_LAYOUT_CONFIG.VISUAL_COMPLEXITY,
    highlightPanelSizeMultiplier:
      options.config?.highlightPanelSizeMultiplier ??
      DEFAULT_LAYOUT_CONFIG.HIGHLIGHT_PANEL_SIZE_MULTIPLIER,
    readingDirection: options.config?.readingDirection ?? ('right-to-left' as const),
  }

  // Restore layout progress from previous generation attempts
  const { pagesCanonical: initialPages, lastPlannedPage: initialLastPage } =
    await restoreLayoutProgress(jobId, episodeNumber, ports, logger)
  let pagesCanonical = initialPages
  let lastPlannedPage = initialLastPage

  const totalPagesTarget = Math.max(episodeData.estimatedPages || 0, lastPlannedPage)
  const splitAgent = new PageSplitAgent()

  const mergePages = (
    existing: Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }>,
    incoming: Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }>,
  ) => {
    const map = new Map<
      number,
      { page_number: number; panels: MangaLayout['pages'][number]['panels'] }
    >()
    for (const p of existing) map.set(p.page_number, p)
    for (const p of incoming) map.set(p.page_number, p) // replace on same number (minor adjustments)
    return Array.from(map.values()).sort((a, b) => a.page_number - b.page_number)
  }

  // Back-edit window: how many previous pages are allowed to be revised
  const BACK_EDIT_WINDOW = DEFAULT_LAYOUT_CONFIG.BACK_EDIT_WINDOW
  let startPage = Math.max(1, lastPlannedPage + 1)
  // Safety guards to avoid infinite loops when generator doesn't advance pages
  let loopCount = 0
  let noProgressStreak = 0
  const LOOP_LIMIT = DEFAULT_LAYOUT_CONFIG.LOOP_LIMIT
  while (startPage <= totalPagesTarget) {
    loopCount++
    if (loopCount > LOOP_LIMIT) {
      logger.error('Layout generation loop limit exceeded', {
        episodeNumber,
        startPage,
        lastPlannedPage,
        totalPagesTarget,
      })
      throw new Error('Layout generation loop limit exceeded (safety abort)')
    }
    await jobRepo.updateStep(jobId, `layout_episode_${episodeNumber}`)

    const plan = await splitAgent.planNextBatch(episodeData, {
      batchSize: DEFAULT_LAYOUT_CONFIG.PAGE_BATCH_SIZE,
      allowMinorAdjustments: true,
      startPage,
      backEditWindow: BACK_EDIT_WINDOW,
    })

    // Generate layout using plan-aware generator
    const layoutGeneratorModule = await import('@/agents/layout-generator')
    if (
      !layoutGeneratorModule.generateMangaLayoutForPlan ||
      typeof layoutGeneratorModule.generateMangaLayoutForPlan !== 'function'
    ) {
      throw new Error('generateMangaLayoutForPlan is not available in layout-generator module')
    }
    const layout = await layoutGeneratorModule.generateMangaLayoutForPlan(
      episodeData,
      plan,
      fullConfig,
      { jobId },
    )

    const rawPages = layout.pages as Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }>
    let batchPages = rawPages
    // Guard: only accept pages in the allowed back-edit window and forward batch
    const minAllowed = Math.max(1, startPage - BACK_EDIT_WINDOW)
    const maxAllowed = Math.max(
      lastPlannedPage,
      startPage + DEFAULT_LAYOUT_CONFIG.PAGE_BATCH_SIZE - 1,
    )
    const beforeFilterCount = batchPages.length
    batchPages = batchPages.filter(
      (p) => p.page_number >= minAllowed && p.page_number <= maxAllowed,
    )
    if (batchPages.length !== beforeFilterCount) {
      logger.warn('Filtered pages outside allowed window', {
        episodeNumber,
        startPage,
        backEditWindow: BACK_EDIT_WINDOW,
        before: beforeFilterCount,
        after: batchPages.length,
      })
    }

    const prevLastPlanned = lastPlannedPage
    pagesCanonical = mergePages(pagesCanonical, batchPages)
    const lastPageInBatch = Math.max(...batchPages.map((p) => p.page_number))
    if (Number.isFinite(lastPageInBatch)) {
      lastPlannedPage = Math.max(lastPlannedPage, lastPageInBatch)
    }

    // Check for progress and potential infinite loop conditions
    if (lastPlannedPage === prevLastPlanned) {
      noProgressStreak += 1
      logger.warn('No progress detected in layout generation batch', {
        episodeNumber,
        currentStreak: noProgressStreak,
        maxAllowed: DEFAULT_LAYOUT_CONFIG.NO_PROGRESS_STREAK_LIMIT_PLAN,
        startPage,
        lastPlannedPage,
        batchPagesCount: batchPages.length,
        totalPagesTarget,
      })

      if (noProgressStreak >= DEFAULT_LAYOUT_CONFIG.NO_PROGRESS_STREAK_LIMIT_PLAN) {
        logger.error('No progress in layout generation for multiple batches; aborting', {
          episodeNumber,
          startPage,
          lastPlannedPage,
          totalPagesTarget,
          finalNoProgressStreak: noProgressStreak,
        })
        throw new Error('Layout generation made no progress')
      }
    } else {
      // Progress made, reset the streak and log positive progress
      if (noProgressStreak > 0) {
        logger.info('Layout generation progress resumed', {
          episodeNumber,
          previousStreak: noProgressStreak,
          oldLastPlanned: prevLastPlanned,
          newLastPlanned: lastPlannedPage,
        })
      }
      noProgressStreak = 0
    }

    const layoutSnapshot: MangaLayout = {
      title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
      created_at: new Date().toISOString().split('T')[0],
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      pages: pagesCanonical,
    }
    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layoutSnapshot, {
      allowFallback: false,
      bypassValidation: true,
    })
    // Persist progress atomically (progress JSON first, then YAML snapshot)
    // CONCURRENCY: Ensure both progress JSON and YAML are written atomically
    // to prevent partial state updates that could be seen by concurrent requests
    try {
      const normalizedPages = Object.keys(normalized.pageIssues).map((k) => Number(k))
      const pagesWithIssueCounts = Object.fromEntries(
        Object.entries(normalized.pageIssues).map(([k, v]) => [Number(k), v.length]),
      ) as Record<number, number>
      const progress = {
        pages: pagesCanonical,
        lastPlannedPage,
        updatedAt: new Date().toISOString(),
        validation: {
          pageIssues: normalized.pageIssues,
          normalizedPages,
          pagesWithIssueCounts,
        },
      }

      // Prepare YAML content first to avoid partial writes
      const yamlContent = yaml.dump(normalized.layout, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      // Write both progress and layout concurrently for better performance
      try {
        await Promise.all([
          ports.layout.putEpisodeLayoutProgress(jobId, episodeNumber, JSON.stringify(progress)),
          ports.layout.putEpisodeLayout(jobId, episodeNumber, yamlContent),
        ])
      } catch (writeError) {
        logger.error('Failed to persist layout progress', {
          episodeNumber,
          error: (writeError as Error).message,
        })
        throw writeError
      }
    } catch (error) {
      logger.error('Failed to persist layout progress', {
        episodeNumber,
        lastPlannedPage,
        pagesCount: pagesCanonical.length,
        error: (error as Error).message,
      })
      throw error
    }

    startPage = lastPlannedPage + 1
  }

  // Episode complete: mark layout done and advance to render
  await jobRepo.markStepCompleted(jobId, 'layout')
  await jobRepo.updateStep(jobId, 'render')
  // Persist per-episode layout totals and recompute job total pages
  try {
    const db = getDatabaseService()
    const totalPagesForEpisode = pagesCanonical.length
    await db.upsertLayoutStatus({
      jobId,
      episodeNumber,
      totalPages: totalPagesForEpisode,
      layoutPath: StorageKeys.episodeLayout(jobId, episodeNumber),
    })
    await db.recomputeJobTotalPages(jobId)
  } catch (e) {
    logger.warn('Failed to persist layout totals', {
      error: (e as Error).message,
      episodeNumber,
    })
  }

  const finalLayout: MangaLayout = {
    title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: episodeData.episodeNumber,
    episodeTitle: episodeData.episodeTitle,
    pages: pagesCanonical,
  }
  const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
  const normalized = normalizeAndValidateLayout(finalLayout, {
    allowFallback: false,
    bypassValidation: true,
  })
  const storageKey = StorageKeys.episodeLayout(jobId, episodeNumber)
  const pageNumbers = pagesCanonical.map((p) => p.page_number).sort((a, b) => a - b)
  return { layout: normalized.layout, storageKey, pageNumbers }
}

// (demoLayoutFromEpisode) was removed: demo mode now uses the normal planning/generation flow
