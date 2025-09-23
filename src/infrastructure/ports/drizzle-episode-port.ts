import { Effect } from 'effect'
import { getLogger } from '@/infrastructure/logging/logger'
import { getStoragePorts } from '@/infrastructure/storage/ports'
import type { EpisodePort } from '@/ports/episode-port'
import { DatabaseError, ExternalIOError } from '@/types/errors/episode-error'
import { JsonStorageKeys, StorageKeys } from '@/utils/storage'

// Lazy import helper to avoid circular initialization at module load
async function getEpisodesService() {
  const { db } = await import('@/services/database')
  return db.episodes()
}

export class DrizzleEpisodePort implements EpisodePort {
  private logger = getLogger().withContext({ port: 'DrizzleEpisodePort' })

  getEpisode(jobId: string, episodeNumber: number) {
    return Effect.tryPromise({
      try: async () => {
        const svc = await getEpisodesService()
        const row = await svc.getEpisode(jobId, episodeNumber)
        if (!row) {
          throw new DatabaseError({ message: 'Episode not found', transient: false })
        }
        return row
      },
      catch: (cause) => new DatabaseError({ message: 'Failed to get episode', cause }),
    })
  }

  getEpisodesByJobId(jobId: string) {
    return Effect.tryPromise({
      try: async () => {
        const svc = await getEpisodesService()
        return await svc.getEpisodesByJobId(jobId)
      },
      catch: (cause) => new DatabaseError({ message: 'Failed to get episodes by job', cause }),
    })
  }

  updateEpisodeTextPath(jobId: string, episodeNumber: number, path: string) {
    return Effect.tryPromise({
      try: async () => {
        const svc = await getEpisodesService()
        await svc.updateEpisodeTextPath(jobId, episodeNumber, path)
        this.logger.debug('updateEpisodeTextPath', { jobId, episodeNumber, path })
      },
      catch: (cause) => new DatabaseError({ message: 'Failed to update episode text path', cause, transient: true }),
    })
  }

  saveLayout(params: {
    novelId: string
    jobId: string
    episodeNumber: number
    layoutJson: { pages?: Array<{ page_number?: number; panels?: Array<unknown> }> }
    fullPagesPath?: string
  }) {
    return Effect.tryPromise({
      try: async () => {
        const { novelId, jobId, episodeNumber, layoutJson } = params

        // --- Basic shape validation (defensive) ---------------------------
        if (!layoutJson || typeof layoutJson !== 'object' || !Array.isArray(layoutJson.pages)) {
          throw new ExternalIOError({
            message: 'layoutJson missing pages array',
            transient: false,
          })
        }

        const pages = layoutJson.pages
        const totalPages = pages.length
        const totalPanels: number = pages.reduce((acc, p) => acc + (Array.isArray(p.panels) ? p.panels.length : 0), 0)

        const storagePorts = getStoragePorts()
        let layoutPath: string | undefined

        // --- Storage writes (atomic best-effort) --------------------------
        try {
          const layoutStr = JSON.stringify(layoutJson)
          const progressStr = JSON.stringify({
            pages,
            lastPlannedPage: Math.max(0, ...pages.map((p) => (typeof p.page_number === 'number' ? p.page_number : 0))),
            updatedAt: new Date().toISOString(),
            validation: { pageIssues: [] }, // layout-generation との整合: pageIssues は呼び出し側で評価済み想定
          })

            ;[layoutPath] = await Promise.all([
              storagePorts.layout.putEpisodeLayout(novelId, jobId, episodeNumber, layoutStr),
              storagePorts.layout.putEpisodeLayoutProgress(
                novelId,
                jobId,
                episodeNumber,
                progressStr,
              ),
            ])
        } catch (e) {
          throw new ExternalIOError({
            message: 'Failed to persist layout files',
            cause: e instanceof Error ? e : undefined,
            transient: false,
          })
        }

        // --- DB persistence ------------------------------------------------
        try {
          const { db } = await import('@/services/database')
          await db.layout().upsertLayoutStatus({
            jobId,
            episodeNumber,
            totalPages,
            totalPanels,
            layoutPath: layoutPath ?? StorageKeys.episodeLayout({
              novelId,
              jobId,
              episodeNumber,
            }),
          })
          await db.jobs().updateJobTotalPages(jobId, totalPages)
        } catch (e) {
          throw new DatabaseError({
            message: 'Failed to persist layout status',
            cause: e instanceof Error ? e : undefined,
          })
        }

        this.logger.info('saveLayout:success', {
          jobId,
          episodeNumber,
          totalPages,
          totalPanels,
          layoutPath,
          fullPagesPath: params.fullPagesPath ?? JsonStorageKeys.fullPages({ novelId, jobId }),
        })
      },
      catch: (cause) =>
        cause instanceof ExternalIOError || cause instanceof DatabaseError
          ? cause
          : new DatabaseError({ message: 'Unknown saveLayout failure', cause }),
    })
  }
}
