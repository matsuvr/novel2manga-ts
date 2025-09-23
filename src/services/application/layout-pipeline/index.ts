import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import { getLayoutBundlingConfig } from '@/config/layout.config'
import type { LoggerPort } from '@/infrastructure/logging/logger'
import type { StoragePorts } from '@/infrastructure/storage/ports'
import type { StepContext } from '@/services/application/steps/base-step'
import type { EpisodeBreakPlan, PageBreakV2 } from '@/types/script'
import { JsonStorageKeys, StorageKeys } from '@/utils/storage'
import { alignEpisodesToPages, bundleEpisodesByActualPageCount } from './helpers'
import type {
  EpisodeWritePayload,
  LayoutPipelineInput,
  LayoutPipelinePorts,
  LayoutPipelineResult,
} from './types'

// NOTE: alignEpisodesToPages / helpers are currently private inside page-break-step.
// For now we re-import via dynamic import to avoid duplication; later we can extract.

export class LayoutPipeline {
  constructor(private readonly ports: LayoutPipelinePorts) {}

  async run(input: LayoutPipelineInput): Promise<LayoutPipelineResult> {
  const { jobId, novelId, script, episodeBreaks, isDemo } = input as LayoutPipelineInput & { isDemo?: boolean }
    try {
      // Stage 1: Segmentation (page break estimation)
      const segmentation = await estimatePageBreaksSegmented(script, { jobId, useImportanceBased: true })
      const pageBreakPlan = segmentation.pageBreaks as PageBreakV2
      const planPanelCount = pageBreakPlan.panels?.length || 0
      const scriptPanelCount = script.panels?.length || 0
      if (planPanelCount !== scriptPanelCount) {
        // 閾値ロジック:
        // 1) segmentation fallback (planPanelCount が非常に小さい ≤ 2) で script 側が多いケースは想定内 → demo か test なら info 降格
        // 2) 差分比率が小さい (|a-b|/max < 0.05) は誤差として info
        const maxPanels = Math.max(planPanelCount, scriptPanelCount)
        const diffRatio = maxPanels === 0 ? 0 : Math.abs(planPanelCount - scriptPanelCount) / maxPanels
        const isSegFallbackPattern = planPanelCount <= 2 && scriptPanelCount >= 10
        const isMinor = diffRatio < 0.05
        const downgrade = isMinor || isSegFallbackPattern || isDemo || process.env.NODE_ENV === 'test'
        const logMeta = { jobId, planPanelCount, scriptPanelCount, diffRatio, isSegFallbackPattern, isDemo }
        if (downgrade) {
          this.ports.logger.info('Panel count mismatch (downgraded)', logMeta)
        } else {
          this.ports.logger.warn('Panel count mismatch between script and pageBreakPlan', logMeta)
        }
      }

      // Stage 1b: Importance invariant (reuse logic by simple inline check similar to current PageBreakStep)
      try {
        const panels = pageBreakPlan.panels || []
        if (panels.length > 0 && script.panels?.length) {
          const byPage = new Map<number, typeof panels>()
          for (const p of panels as typeof panels) {
            const arr = byPage.get(p.pageNumber)
            if (arr) arr.push(p)
            else byPage.set(p.pageNumber, [p])
          }
          const maxPage = Math.max(...Array.from(byPage.keys()))
          for (const [pageNo, pagePanels] of byPage.entries()) {
            if (pageNo === maxPage) continue
            let sum = 0
            for (const pb of pagePanels) {
              const original = script.panels[pb.panelIndex - 1]
              if (original) {
                const imp = Math.max(1, Math.min(6, (original as { importance?: number }).importance || 1))
                sum += imp
              }
            }
            if (sum < 6) {
              throw new Error(`Importance invariant violated at layout stage: page ${pageNo} total=${sum} (<6)`) // triggers catch
            }
          }
        }
      } catch (inv) {
        return { success: false, error: { kind: 'IMPORTANCE_INVARIANT_FAILED', message: inv instanceof Error ? inv.message : String(inv), cause: inv, stage: 'importance-invariant' } }
      }

      // Stage 2: Align episodes to pages (extracted helper)
      const totalPanels = planPanelCount || scriptPanelCount
      let alignedEpisodes: EpisodeBreakPlan
      try {
        alignedEpisodes = alignEpisodesToPages(episodeBreaks, pageBreakPlan, totalPanels)
      } catch (alignErr) {
        return {
          success: false,
          error: {
            kind: 'ALIGNMENT_FAILED',
            message: alignErr instanceof Error ? alignErr.message : String(alignErr),
            cause: alignErr,
            stage: 'alignment',
          },
        }
      }

      // Stage 3: Bundling using layout config (not app global bundling to decouple)
      const bundlingCfg = getLayoutBundlingConfig()
      // Create a minimal object matching the subset of StepContext fields used by bundleEpisodesByActualPageCount
      // (expects jobId, novelId, logger, ports.layoutStorage at least via context if referenced internally)
      // Minimal context: bundling only reads jobId/logger currently.
      // Provide empty object cast for ports to satisfy StepContext without unsafe any usage.
      const loggerAdapter: LoggerPort = {
        debug: (m, meta) => this.ports.logger.info(m, meta),
        info: (m, meta) => this.ports.logger.info(m, meta),
        warn: (m, meta) => this.ports.logger.warn(m, meta),
        error: (m, meta) => this.ports.logger.error(m, meta),
        withContext: () => loggerAdapter,
      }
      const minimalContext: StepContext = {
        jobId,
        novelId,
        logger: loggerAdapter,
        ports: {} as StoragePorts,
      }
      const bundledEpisodes = bundleEpisodesByActualPageCount(
        alignedEpisodes,
        pageBreakPlan,
        { enabled: bundlingCfg.enabled, minPageCount: bundlingCfg.minPageCount },
        minimalContext,
      )

      // Stage 4: Per-episode layout build + persist status
      // Acquire layout builder (dynamic to tolerate vitest mocks omitting export)
      interface LayoutBuilderModule { buildLayoutFromPageBreaks?: (pageBreak: { panels: PageBreakV2['panels'] }, meta: { title: string; episodeNumber: number; episodeTitle: string }) => { pages: Array<{ page_number: number; panels: unknown[] }> } }
      type LayoutFn = NonNullable<LayoutBuilderModule['buildLayoutFromPageBreaks']>
      let layoutFn: LayoutFn
      try {
        const mod: LayoutBuilderModule = await import('@/agents/script/panel-assignment')
        if (typeof mod.buildLayoutFromPageBreaks === 'function') {
          layoutFn = mod.buildLayoutFromPageBreaks
        } else {
          throw new Error('buildLayoutFromPageBreaks missing in mocked module')
        }
      } catch (err) {
        this.ports.logger.warn('Falling back to internal simple layout builder', {
          jobId,
          reason: err instanceof Error ? err.message : String(err),
        })
        layoutFn = (pageBreak, _meta) => {
          const byPage = new Map<number, PageBreakV2['panels']>()
          for (const p of pageBreak.panels) {
            const arr = byPage.get(p.pageNumber) || []
            arr.push(p)
            byPage.set(p.pageNumber, arr)
          }
          const pages = Array.from(byPage.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([page, panels]) => ({ page_number: page, panels }))
          return { pages }
        }
      }
      const pagesAccumulator: Array<{ page_number: number; panels: unknown[] }> = []
      for (const episode of bundledEpisodes.episodes) {
        const episodePanels = pageBreakPlan.panels
          .map((p, idx) => ({ p, idx: idx + 1 }))
          .filter(({ idx }) => idx >= episode.startPanelIndex && idx <= episode.endPanelIndex)
          .map(({ p }) => p)

        const pageOrder = Array.from(new Set(episodePanels.map((p) => p.pageNumber))).sort((a, b) => a - b)
        const pageMap = new Map<number, number>()
        pageOrder.forEach((pg, i) => pageMap.set(pg, i + 1))
        const remappedPanels = episodePanels.map((p) => ({ ...p, pageNumber: pageMap.get(p.pageNumber) || 1 }))

        const layout = layoutFn(
          { panels: remappedPanels },
          {
            title: episode.title || `Episode ${episode.episodeNumber}`,
            episodeNumber: episode.episodeNumber,
            episodeTitle: episode.title || `Episode ${episode.episodeNumber}`,
          },
        )

        pagesAccumulator.push(...layout.pages)

        const key = StorageKeys.episodeLayout({ novelId, jobId, episodeNumber: episode.episodeNumber })
        try {
          await this.ports.layoutStorage.put(key, JSON.stringify(layout, null, 2), {
            contentType: 'application/json; charset=utf-8',
            jobId,
            novelId,
            episode: String(episode.episodeNumber),
          })
          await this.ports.db.layout.upsertLayoutStatus({
            jobId,
            episodeNumber: episode.episodeNumber,
            totalPages: layout.pages.length,
            totalPanels: episodePanels.length,
            layoutPath: key,
          })
        } catch (persistErr) {
          return { success: false, error: { kind: 'LAYOUT_PERSIST_FAILED', message: persistErr instanceof Error ? persistErr.message : String(persistErr), cause: persistErr, stage: 'episode-layout-persist' } }
        }
      }

      // Stage 5: Combined full pages
  const fullPagesKey = JsonStorageKeys.fullPages({ novelId, jobId })
      try {
        await this.ports.layoutStorage.put(
          fullPagesKey,
          JSON.stringify(
            {
              title: 'Combined Episodes',
              episodeNumber: 1,
              episodeTitle: 'Combined Episodes',
              pages: pagesAccumulator.sort((a, b) => a.page_number - b.page_number),
              episodes: bundledEpisodes.episodes,
            },
            null,
            2,
          ),
          { contentType: 'application/json; charset=utf-8', jobId, novelId },
        )
      } catch (err) {
        return { success: false, error: { kind: 'LAYOUT_PERSIST_FAILED', message: err instanceof Error ? err.message : String(err), cause: err, stage: 'full-pages-persist' } }
      }

      // Stage 6: Persist bundled episodes to DB
      try {
        const jobRow = await this.ports.db.jobs.getJob(jobId)
        if (jobRow) {
          // Lazy import to reuse mapping logic
            const { buildPanelToChunkMapping, getChunkForPanel } = await import('@/services/application/panel-to-chunk-mapping')
            const panelToChunkMapping = await buildPanelToChunkMapping(
              novelId,
              jobId,
              jobRow.totalChunks ?? 0,
              this.ports.logger,
            )
            const episodesForDb: EpisodeWritePayload[] = bundledEpisodes.episodes.map((ep) => {
              const startChunk = getChunkForPanel(panelToChunkMapping, ep.startPanelIndex)
              const endChunk = getChunkForPanel(panelToChunkMapping, ep.endPanelIndex)
              return {
                novelId: jobRow.novelId,
                jobId,
                episodeNumber: ep.episodeNumber,
                title: ep.title,
                summary: undefined,
                startChunk,
                startCharIndex: 0,
                endChunk,
                endCharIndex: 0,
                startPanelIndex: ep.startPanelIndex,
                endPanelIndex: ep.endPanelIndex,
                confidence: 1,
              }
            })
            await this.ports.db.episodesWriter.bulkReplaceByJobId(episodesForDb)
        }
      } catch (epErr) {
        return { success: false, error: { kind: 'EPISODE_PERSIST_FAILED', message: epErr instanceof Error ? epErr.message : String(epErr), cause: epErr, stage: 'episode-db-persist' } }
      }

      return { success: true, data: { pageBreakPlan, totalPages: pagesAccumulator.length, bundledEpisodes } }
    } catch (e) {
      return { success: false, error: { kind: 'SEGMENTATION_FAILED', message: e instanceof Error ? e.message : String(e), cause: e, stage: 'segmentation' } }
    }
  }
}
