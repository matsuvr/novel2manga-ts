import type { Job } from '@/db/schema'
import { getLogger } from '@/infrastructure/logging/logger'
import { db } from '@/services/database'
import type { ModelTokenUsage } from '@/services/database/token-usage-database-service'
import type { Episode } from '@/types/database-models'
import type { JobDto } from '@/types/dto'
import { mapJobToDto } from '@/types/dto'
import { isRenderCompletelyDone } from '@/utils/completion'
import { loadNovelPreview } from '@/utils/novel-text'
import { JsonStorageKeys, StorageFactory } from '@/utils/storage'

export interface CoverageWarning {
  chunkIndex: number
  coverageRatio: number
  message: string
  episodeNumbers?: number[]
}

export interface JobResultsData {
  normalizedJob: JobDto
  normalizedEpisodes: Episode[]
  layoutStatuses: Array<{ episodeNumber: number; totalPages?: number }>
  coverageWarnings: CoverageWarning[]
  tokenUsageByModel: ModelTokenUsage[]
  novelPreview?: string
  jobCompleted: boolean
  renderDone: boolean
  fullPagesPresent: boolean
}

function normalizeEpisodes(episodes: Episode[]): Episode[] {
  const episodeByNumber = episodes.reduce((acc, episode) => {
    const numberValue = Number(episode.episodeNumber) || 0
    const existing = acc.get(numberValue)
    if (!existing) {
      acc.set(numberValue, episode)
      return acc
    }

    const existingHasTitle = !!existing.title
    const newHasTitle = !!episode.title
    if (newHasTitle && !existingHasTitle) {
      acc.set(numberValue, episode)
      return acc
    }

    const existingConfidence = typeof existing.confidence === 'number' ? existing.confidence : 0
    const newConfidence = typeof episode.confidence === 'number' ? episode.confidence : 0
    if (newConfidence > existingConfidence) {
      acc.set(numberValue, episode)
    }
    return acc
  }, new Map<number, Episode>())

  return Array.from(episodeByNumber.values()).sort(
    (a, b) => Number(a.episodeNumber) - Number(b.episodeNumber),
  )
}

function parseCoverageWarnings(raw: string | null): CoverageWarning[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as CoverageWarning[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { chunkIndex?: unknown }).chunkIndex === 'number' &&
        typeof (item as { coverageRatio?: unknown }).coverageRatio === 'number' &&
        typeof (item as { message?: unknown }).message === 'string',
      )
      .map((item) => ({
        chunkIndex: Number(item.chunkIndex),
        coverageRatio: Number(item.coverageRatio),
        message: String(item.message),
        episodeNumbers: Array.isArray(item.episodeNumbers)
          ? item.episodeNumbers
              .map((value) => (typeof value === 'number' ? value : Number.parseInt(String(value), 10)))
              .filter((value) => Number.isFinite(value))
          : undefined,
      }))
  } catch (error) {
    console.warn('Failed to parse coverage warnings:', error)
    return []
  }
}

export async function loadJobResults(job: Job, novelId: string): Promise<JobResultsData> {
  const renderDone = isRenderCompletelyDone(job as unknown as Parameters<typeof isRenderCompletelyDone>[0])
  const jobCompleted = job.status === 'completed' || job.status === 'complete'

  const [tokenUsageByJob, novel, layoutStatuses, episodes] = await Promise.all([
    db.tokenUsage().getTotalsByJobIdsGroupedByModel([job.id]),
    db.novels().getNovel(job.novelId),
    db.layout().getLayoutStatusByJobId(job.id),
    db.episodes().getEpisodesByJobId(job.id),
  ])

  const layoutStorage = await StorageFactory.getLayoutStorage()
  const fullPagesKey = JsonStorageKeys.fullPages({ novelId, jobId: job.id })
  const fullPages = await layoutStorage.get(fullPagesKey)
  const fullPagesPresent = Boolean(fullPages)

  let novelPreview: string | undefined
  if (novel?.originalTextPath) {
    try {
      novelPreview = await loadNovelPreview(novel.originalTextPath, { length: 100 })
    } catch (error) {
      getLogger()
        .withContext({ page: 'JobResultsLoader', novelId, jobId: job.id })
        .error('Failed to load novel preview for results page', {
          path: novel.originalTextPath,
          error: error instanceof Error ? error.message : String(error),
        })
      novelPreview = undefined
    }
  }

  const modelTokenUsage: ModelTokenUsage[] = [...(tokenUsageByJob[job.id] ?? [])].sort(
    (a: ModelTokenUsage, b: ModelTokenUsage) => {
      const providerDiff = a.provider.localeCompare(b.provider)
      if (providerDiff !== 0) return providerDiff
      return a.model.localeCompare(b.model)
    },
  )

  const normalizedJob: JobDto = mapJobToDto(job)
  const normalizedEpisodes = normalizeEpisodes(
    episodes.map((episode) => ({
      ...episode,
      title: (episode.title as string | null) ?? undefined,
      summary: (episode.summary as string | null) ?? undefined,
      createdAt: new Date((episode as unknown as { createdAt?: string }).createdAt ?? Date.now()),
    })),
  )

  const coverageWarnings = parseCoverageWarnings(job.coverageWarnings ?? null)

  return {
    normalizedJob,
    normalizedEpisodes,
    layoutStatuses,
    coverageWarnings,
    tokenUsageByModel: modelTokenUsage,
    novelPreview,
    jobCompleted,
    renderDone,
    fullPagesPresent,
  }
}
