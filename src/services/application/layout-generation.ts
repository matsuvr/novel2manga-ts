import yaml from 'js-yaml'
import { generateMangaLayoutForPlan } from '@/agents/layout-generator'
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
      min: options.config?.panelsPerPage?.min ?? 3,
      max: options.config?.panelsPerPage?.max ?? 6,
      average: options.config?.panelsPerPage?.average ?? 4.5,
    },
    dialogueDensity: options.config?.dialogueDensity ?? 0.6,
    visualComplexity: options.config?.visualComplexity ?? 0.7,
    highlightPanelSizeMultiplier: options.config?.highlightPanelSizeMultiplier ?? 2.0,
    readingDirection: options.config?.readingDirection ?? ('right-to-left' as const),
  }

  // Incremental generation (batch of 3 pages), with atomic progress checkpoint
  if (isDemo) {
    const layout: MangaLayout = demoLayoutFromEpisode(episodeData)
    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layout)
    const yamlContent = yaml.dump(normalized.layout, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    })
    const storageKey = await ports.layout.putEpisodeLayout(jobId, episodeNumber, yamlContent)
    await jobRepo.markStepCompleted(jobId, 'layout')
    await jobRepo.updateStep(jobId, 'render')
    const pageNumbers = Array.isArray(layout.pages)
      ? (layout.pages as Array<{ page_number: number }>)
          .map((p) => p.page_number)
          .sort((a, b) => a - b)
      : []
    return { layout: normalized.layout, storageKey, pageNumbers }
  }

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
  const BACK_EDIT_WINDOW = 2
  let startPage = Math.max(1, lastPlannedPage + 1)
  while (startPage <= totalPagesTarget) {
    await jobRepo.updateStep(jobId, `layout_episode_${episodeNumber}`)

    const plan = await splitAgent.planNextBatch(episodeData, {
      batchSize: 3,
      allowMinorAdjustments: true,
      startPage,
      backEditWindow: BACK_EDIT_WINDOW,
    })

    const layout = await generateMangaLayoutForPlan(episodeData, plan, fullConfig, { jobId })
    let batchPages = (layout.pages || []) as Array<{
      page_number: number
      panels: MangaLayout['pages'][number]['panels']
    }>
    // Guard: only accept pages in the allowed back-edit window and forward batch
    const minAllowed = Math.max(1, startPage - BACK_EDIT_WINDOW)
    const maxAllowed = Math.max(lastPlannedPage, startPage + 3 - 1)
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

    pagesCanonical = mergePages(pagesCanonical, batchPages)
    const lastPageInBatch = Math.max(...batchPages.map((p) => p.page_number))
    lastPlannedPage = Math.max(lastPlannedPage, lastPageInBatch)

    const layoutSnapshot: MangaLayout = {
      title: episodeData.episodeTitle || `エピソード${episodeData.episodeNumber}`,
      created_at: new Date().toISOString().split('T')[0],
      episodeNumber: episodeData.episodeNumber,
      episodeTitle: episodeData.episodeTitle,
      pages: pagesCanonical,
    }
    const { normalizeAndValidateLayout } = await import('@/utils/layout-normalizer')
    const normalized = normalizeAndValidateLayout(layoutSnapshot)
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
  const normalized = normalizeAndValidateLayout(finalLayout)
  const storageKey = StorageKeys.episodeLayout(jobId, episodeNumber)
  const pageNumbers = pagesCanonical.map((p) => p.page_number).sort((a, b) => a - b)
  return { layout: normalized.layout, storageKey, pageNumbers }
}

function demoLayoutFromEpisode(ep: EpisodeData): MangaLayout {
  return {
    title: ep.episodeTitle || `エピソード${ep.episodeNumber}`,
    author: 'Demo',
    created_at: new Date().toISOString().split('T')[0],
    episodeNumber: ep.episodeNumber,
    episodeTitle: ep.episodeTitle,
    pages: [
      {
        page_number: 1,
        panels: [
          {
            id: 'p1',
            position: { x: 0.1, y: 0.1 }, // Normalized coordinates [0,1]
            size: { width: 0.8, height: 0.5 }, // Normalized size [0,1]
            content: '場所: 公園\n新しい挑戦',
            dialogues: [{ speaker: '太郎', text: 'やってみよう！', emotion: 'excited' }],
            sourceChunkIndex: 0,
            importance: 8,
          },
        ],
      },
    ],
  }
}
