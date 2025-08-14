import yaml from 'js-yaml'
import { generateMangaLayout } from '@/agents/layout-generator'
import { getLogger, type LoggerPort } from '@/infrastructure/logging/logger'
import { getStoragePorts, type StoragePorts } from '@/infrastructure/storage/ports'
import { adaptAll } from '@/repositories/adapters'
import { EpisodeRepository } from '@/repositories/episode-repository'
import { JobRepository } from '@/repositories/job-repository'
import { getDatabaseService } from '@/services/db-factory'
import type { EpisodeData, MangaLayout } from '@/types/panel-layout'

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
        dialogues: [{ speaker: '太郎', text: 'やってみよう！', emotion: 'excited', context: '' }],
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

  const layout: MangaLayout = isDemo
    ? demoLayoutFromEpisode(episodeData)
    : await generateMangaLayout(episodeData, fullConfig)

  const yamlContent = yaml.dump(layout, { indent: 2, lineWidth: -1, noRefs: true })
  const storageKey = await ports.layout.putEpisodeLayout(jobId, episodeNumber, yamlContent)

  // Mark layout done and advance to render
  await jobRepo.markStepCompleted(jobId, 'layout')
  await jobRepo.updateStep(jobId, 'render')

  const pageNumbers = Array.isArray(layout.pages)
    ? (layout.pages as Array<{ page_number: number }>)
        .map((p) => p.page_number)
        .sort((a, b) => a - b)
    : []

  return { layout, storageKey, pageNumbers }
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
            position: { x: 40, y: 40 },
            size: { width: 360, height: 220 },
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
