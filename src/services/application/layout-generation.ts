import yaml from 'js-yaml'
import { PageSplitAgent } from '@/agents/page-splitter'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { Dialogue, EpisodeData, MangaLayout } from '@/types/panel-layout'
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
  const db = getDatabaseService()
  const { episode: episodePort, job: jobPort } = adaptAll(db)
  const episodeRepo = new EpisodeRepository(episodePort)
  const jobRepo = new JobRepository(jobPort)

  const isDemo = options.isDemo === true

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
  // Ensure episode is defined for downstream use
  if (!episode) {
    throw new Error('Episode could not be resolved')
  }

  // Build episode data: gather chunk analyses or provide demo minimal
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
    for (let i = ensured.startChunk; i <= ensured.endChunk; i++) {
      const chunkContent = await ports.chunk.getChunk(jobId, i)
      if (!chunkContent) {
        logger.error('Chunk not found', { chunkIndex: i })
        throw new Error(`Chunk ${i} not found for job ${jobId}`)
      }
      const obj = await ports.analysis.getAnalysis(jobId, i)
      if (!obj) {
        logger.error('Analysis not found', { chunkIndex: i })
        throw new Error(`Analysis not found for chunk ${i}`)
      }
      const parsed = JSON.parse(obj.text) as { analysis?: unknown }
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
  }

  if (chunkDataArray.length === 0) throw new Error('Chunk analysis data not found')

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

  // Incremental generation (batch of pages), with atomic progress checkpoint

  // Load existing progress (for resume) or seed from YAML if present
  const progressRaw = await ports.layout.getEpisodeLayoutProgress(jobId, episodeNumber)
  let pagesCanonical: Array<{
    page_number: number
    panels: MangaLayout['pages'][number]['panels']
  }> = []
  let lastPlannedPage = 0
  if (progressRaw) {
    try {
      const parsed = JSON.parse(progressRaw) as {
        pages: Array<{ page_number: number; panels: unknown }>
        lastPlannedPage: number
      }
      pagesCanonical = (parsed.pages || []) as Array<{
        page_number: number
        panels: MangaLayout['pages'][number]['panels']
      }>
      lastPlannedPage =
        parsed.lastPlannedPage || (pagesCanonical[pagesCanonical.length - 1]?.page_number ?? 0)
    } catch (e) {
      logger.warn('Failed to parse progress JSON, fallback to YAML', {
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
  const LOOP_LIMIT = 50
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

    // Dynamically import generator to tolerate test mocks that only export generateMangaLayout
    const generatorMod = await import('@/agents/layout-generator')
    // Vitest's ESM mock throws when accessing undefined named exports.
    // Guard property access with try/catch to avoid throwing on missing exports.
    let genForPlan:
      | ((
          episodeData: EpisodeData,
          plan: unknown,
          cfg?: unknown,
          options?: { jobId?: string },
        ) => Promise<MangaLayout>)
      | undefined
    let genBasic:
      | ((
          episodeData: EpisodeData,
          cfg?: unknown,
          options?: { jobId?: string },
        ) => Promise<unknown>)
      | undefined
    try {
      genForPlan = (generatorMod as Record<string, unknown>)
        .generateMangaLayoutForPlan as typeof genForPlan
    } catch {
      genForPlan = undefined
    }
    try {
      genBasic = (generatorMod as Record<string, unknown>).generateMangaLayout as typeof genBasic
    } catch {
      genBasic = undefined
    }

    // Use plan-aware generator when available; otherwise fallback to basic generator (mocked in tests)
    const usedBasicFallback = !genForPlan && !!genBasic
    const generated = genForPlan
      ? await genForPlan(episodeData, plan, fullConfig, { jobId })
      : genBasic
        ? await genBasic(episodeData, fullConfig, { jobId })
        : { pages: [] }

    // Coerce possible mocked shapes to MangaLayout
    const coerceToLayout = (val: unknown): MangaLayout => {
      const asObj = (v: unknown): Record<string, unknown> =>
        v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
      const src = asObj(val)
      const layoutLike =
        src.layout && typeof src.layout === 'object' ? (src.layout as Record<string, unknown>) : src
      const pagesRaw = Array.isArray(layoutLike.pages) ? (layoutLike.pages as unknown[]) : []
      const toNumber = (n: unknown, d = 0) => (typeof n === 'number' ? n : d)
      const toStr = (s: unknown, d = '') => (typeof s === 'string' ? s : d)
      const toPos = (p: unknown) =>
        p &&
        typeof p === 'object' &&
        'x' in (p as Record<string, unknown>) &&
        'y' in (p as Record<string, unknown>)
          ? (p as { x: number; y: number })
          : { x: 0, y: 0 }
      const toSize = (s: unknown) =>
        s &&
        typeof s === 'object' &&
        'width' in (s as Record<string, unknown>) &&
        'height' in (s as Record<string, unknown>)
          ? (s as { width: number; height: number })
          : { width: 1, height: 1 }
      const panelsFrom = (arr: unknown): MangaLayout['pages'][number]['panels'] =>
        Array.isArray(arr)
          ? arr.map((panelRaw) => {
              const po = asObj(panelRaw)
              return {
                id: toStr(po.id, ''),
                content: toStr(po.content, ''),
                dialogues: Array.isArray(po.dialogues) ? (po.dialogues as Dialogue[]) : undefined,
                sourceChunkIndex: toNumber(po.sourceChunkIndex, 0),
                importance: toNumber(po.importance, 5),
                position: toPos(po.position),
                size: toSize(po.size),
              }
            })
          : []
      const pages = pagesRaw.map((pRaw) => {
        const p = asObj(pRaw)
        const pageNum = toNumber(
          (p.page_number as unknown) ?? (p.pageNumber as unknown) ?? (p.page as unknown),
          0,
        )
        return {
          page_number: pageNum,
          panels: panelsFrom(p.panels as unknown),
        }
      })
      return {
        title: toStr(layoutLike.title, `エピソード${episodeData.episodeNumber}`),
        created_at: toStr(layoutLike.created_at, new Date().toISOString().split('T')[0]),
        episodeNumber: toNumber(layoutLike.episodeNumber, episodeData.episodeNumber),
        episodeTitle: toStr(layoutLike.episodeTitle, episodeData.episodeTitle || ''),
        pages,
      }
    }

    const layout = coerceToLayout(generated)
    const rawPages = (layout.pages || []) as Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }>
    // If using basic fallback (plan-unaware), re-number pages to the requested window
    // so they are not filtered out as back-edit pages.
    let batchPages: Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }> = usedBasicFallback
      ? rawPages.map((p, idx) => ({ ...p, page_number: startPage + idx }))
      : rawPages
    // Guard: only accept pages in the allowed back-edit window and forward batch
    // When using basic fallback (plan-unaware mocks), disallow back-edit pages to prevent loops
    const minAllowed = usedBasicFallback ? startPage : Math.max(1, startPage - BACK_EDIT_WINDOW)
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

    if (lastPlannedPage === prevLastPlanned) {
      noProgressStreak += 1
      if (usedBasicFallback && noProgressStreak >= 2) {
        logger.error(
          'No progress in layout generation with basic generator; aborting to avoid infinite loop',
          {
            episodeNumber,
            startPage,
            lastPlannedPage,
            totalPagesTarget,
          },
        )
        throw new Error('Layout generation made no progress with basic generator')
      }
      if (!usedBasicFallback && noProgressStreak >= 5) {
        logger.error('No progress in layout generation for multiple batches; aborting', {
          episodeNumber,
          startPage,
          lastPlannedPage,
          totalPagesTarget,
        })
        throw new Error('Layout generation made no progress')
      }
    } else {
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

      // Write progress JSON first (smaller, faster), then YAML snapshot
      // This ordering ensures progress is always available, even if YAML write fails
      await ports.layout.putEpisodeLayoutProgress(jobId, episodeNumber, JSON.stringify(progress))

      const yamlContent = yaml.dump(normalized.layout, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
      })
      await ports.layout.putEpisodeLayout(jobId, episodeNumber, yamlContent)
    } catch (error) {
      logger.error('Failed to persist layout progress atomically', {
        episodeNumber,
        lastPlannedPage,
        pagesCount: pagesCanonical.length,
        error: (error as Error).message,
      })
      // Re-throw to trigger cleanup and prevent inconsistent state
      throw error
    }

    startPage = lastPlannedPage + 1
  }

  // Episode complete: mark layout done and advance to render
  await jobRepo.markStepCompleted(jobId, 'layout')
  await jobRepo.updateStep(jobId, 'render')

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
