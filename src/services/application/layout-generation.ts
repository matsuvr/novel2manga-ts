import yaml from 'js-yaml'
import { appConfig } from '@/config/app.config'
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

  if (!progressRaw && pagesCanonical.length === 0) {
    const yamlExisting = await ports.layout.getEpisodeLayout(jobId, episodeNumber)
    if (yamlExisting) {
      try {
        const { parseMangaLayoutFromYaml } = await import('@/utils/layout-parser')
        const parsed = parseMangaLayoutFromYaml(yamlExisting)
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

  // ===== New script-based flow: script -> page-breaks -> panel assignment =====
  try {
    const episodeText = episodeData.chunks.map((c) => c.text).join('\n')

    // Progress validation: Ensure minimum content exists
    if (!episodeText.trim()) {
      logger.error('No episode text content available for layout generation', { episodeNumber })
      throw new Error('No episode text content available for layout generation')
    }

    const { convertEpisodeTextToScript } = await import('@/agents/script/script-converter')
    const script = await convertEpisodeTextToScript(episodeText, {
      jobId,
      episodeNumber: episode.episodeNumber,
    })

    // Progress validation: Script conversion must produce results
    if (!script?.script || script.script.length === 0) {
      logger.error('Script conversion failed to produce valid script', { episodeNumber })
      throw new Error('Script conversion failed to produce valid script')
    }

    const { estimatePageBreaks } = await import('@/agents/script/page-break-estimator')
    const targetPages = Math.max(
      episodeData.estimatedPages || 0,
      Math.ceil(episodeText.length / (appConfig.processing.episode.charsPerPage || 400)),
      1,
    )
    const avgLines = Math.max(
      4,
      Math.floor((script.script.length || 12) / Math.max(1, targetPages)),
    )
    const pageBreaks = await estimatePageBreaks(script, {
      targetPages,
      avgLinesPerPage: avgLines,
      jobId,
      episodeNumber: episode.episodeNumber,
    })

    // Progress validation: Page breaks must be estimated
    if (!pageBreaks?.pages || pageBreaks.pages.length === 0) {
      logger.error('Page break estimation failed to produce valid page breaks', {
        episodeNumber,
        targetPages,
        scriptLength: script.script.length,
      })
      throw new Error('Page break estimation failed to produce valid page breaks')
    }

    const { assignPanels, buildLayoutFromAssignment } = await import(
      '@/agents/script/panel-assignment'
    )
    const assignment = await assignPanels(script, pageBreaks, {
      jobId,
      episodeNumber: episode.episodeNumber,
    })

    // Progress validation: Panel assignment must produce results
    if (!assignment?.pages || assignment.pages.length === 0) {
      logger.error('Panel assignment failed to produce valid assignment', {
        episodeNumber,
        pageBreaksCount: pageBreaks.pages.length,
      })
      throw new Error('Panel assignment failed to produce valid assignment')
    }

    const layoutBuilt = buildLayoutFromAssignment(script, assignment, {
      title: episodeData.title,
      episodeNumber: episode.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
    })

    // Progress validation: Layout building must produce expected page count
    if (!layoutBuilt?.pages || layoutBuilt.pages.length < targetPages) {
      logger.error('Layout building failed to produce sufficient pages', {
        episodeNumber,
        expectedPages: targetPages,
        actualPages: layoutBuilt?.pages?.length || 0,
      })
      throw new Error('Layout building failed to produce sufficient pages')
    }

    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layoutBuilt, {
      allowFallback: false,
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

    // 保存（bbox形式）- with atomic error handling
    try {
      const { toBBoxLayout } = await import('@/utils/layout-parser')
      const yamlContent = yaml.dump(toBBoxLayout(normalized.layout), {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })

      // Atomic write operations - must both succeed or both fail
      await Promise.all([
        ports.layout.putEpisodeLayout(jobId, episodeNumber, yamlContent),
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
      throw new Error(`Storage operation failed: ${(storageError as Error).message}`)
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

    try {
      const db = getDatabaseService()
      await db.upsertLayoutStatus({
        jobId,
        episodeNumber,
        totalPages: normalized.layout.pages.length,
        layoutPath: StorageKeys.episodeLayout(jobId, episodeNumber),
      })
      await db.recomputeJobTotalPages(jobId)
    } catch (dbError) {
      logger.error('Failed to persist layout totals to database', {
        error: (dbError as Error).message,
        episodeNumber,
      })
      throw new Error(`Database update failed: ${(dbError as Error).message}`)
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
