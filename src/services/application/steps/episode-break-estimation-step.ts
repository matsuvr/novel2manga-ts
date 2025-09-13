import type { z } from 'zod'
import {
  DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
  type ScriptSegmentationConfig,
  segmentScript,
} from '@/agents/script/script-segmenter'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides, getEpisodeConfig } from '@/config'
import { getProviderForUseCase } from '@/config/llm.config'
import { type EpisodeBreakPlan, EpisodeBreakSchema, type NewMangaScript } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface EpisodeBreakResult {
  episodeBreaks: EpisodeBreakPlan
  totalEpisodes: number
}

type EpisodeConfig = ReturnType<typeof getEpisodeConfig>

export class EpisodeBreakEstimationStep implements PipelineStep {
  readonly stepName = 'episode-break-estimation'

  /**
   * Estimate episode breaks from combined script using sliding window for long scripts
   */
  async estimateEpisodeBreaks(
    combinedScript: NewMangaScript,
    context: StepContext,
  ): Promise<StepExecutionResult<EpisodeBreakResult>> {
    const { jobId, logger } = context

    try {
      const totalPanels = combinedScript.panels?.length || 0
      // Fetch app config once to avoid inconsistent per-call overrides
      const appCfg = this.getAppConfig()
      const episodeCfg = this.getEpisodeCfgSafe()
      logger.info('Starting episode break estimation', {
        jobId,
        panelCount: totalPanels,
      })

      // Read segmentation config from app config
      const segmentationConfig: ScriptSegmentationConfig = {
        ...DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
        ...(appCfg.scriptSegmentation || {}),
      }

      // Check if we need to use sliding window approach
      if (totalPanels <= segmentationConfig.minPanelsForSegmentation) {
        logger.info('Using direct episode break estimation (small script)', {
          jobId,
          panelCount: totalPanels,
        })
        return await this.estimateEpisodeBreaksDirect(combinedScript, context, appCfg, episodeCfg)
      } else {
        logger.info('Using sliding window episode break estimation (large script)', {
          jobId,
          panelCount: totalPanels,
          segmentationConfig,
        })
        return await this.estimateEpisodeBreaksWithSlidingWindow(
          combinedScript,
          segmentationConfig,
          context,
          appCfg,
          episodeCfg,
        )
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('Episode break estimation failed', {
        jobId: context.jobId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      })
      return { success: false, error: errorMessage }
    }
  }

  /**
   * Direct episode break estimation for smaller scripts
   */
  private async estimateEpisodeBreaksDirect(
    combinedScript: NewMangaScript,
    context: StepContext,
    appCfg: AppConfig,
    episodeCfg: EpisodeConfig,
  ): Promise<StepExecutionResult<EpisodeBreakResult>> {
    const { jobId, logger } = context

    // Use provider for episode break estimation
    const provider = getProviderForUseCase('episodeBreak')
    const generator = new DefaultLlmStructuredGenerator([provider])

    // Read prompts from provided app config
    const eb = appCfg.llm.episodeBreakEstimation || { systemPrompt: '', userPromptTemplate: '' }

    // Create prompt with script data
    const prompt = (eb.userPromptTemplate || '').replace(
      '{{scriptJson}}',
      JSON.stringify(combinedScript, null, 2),
    )

    const result = await generator.generateObjectWithFallback<EpisodeBreakPlan>({
      name: 'episode-break-estimation',
      systemPrompt: eb.systemPrompt,
      userPrompt: prompt,
      schema: EpisodeBreakSchema as unknown as z.ZodTypeAny,
      schemaName: 'EpisodeBreakPlan',
      telemetry: { jobId, stepName: 'episode' },
    })

    // If LLM produced no episodes, fall back to a conservative single-episode plan
    if (!result || !result.episodes || result.episodes.length === 0) {
      logger.warn(
        'Episode break estimation returned no episodes — falling back to single-episode',
        {
          jobId,
        },
      )
      const totalPanels = combinedScript.panels?.length || 0
      const fallback: EpisodeBreakPlan = {
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            description: '',
            startPanelIndex: 1,
            endPanelIndex: Math.max(1, totalPanels),
          } as unknown as EpisodeBreakPlan['episodes'][number],
        ],
      }
      return {
        success: true,
        data: { episodeBreaks: fallback, totalEpisodes: fallback.episodes.length },
      }
    }

    // Normalize and then validate for strict continuity and bounds
    const totalPanels = combinedScript.panels?.length || 0
    const normalized = this.normalizeEpisodeBreaks(result, totalPanels)
    // Enforce max-length deterministically before validation
    let bundled: EpisodeBreakPlan
    try {
      bundled = this.bundleAndValidate(
        normalized,
        totalPanels,
        context,
        appCfg,
        episodeCfg,
        'Episode break validation',
      )
    } catch (err) {
      // If validation fails after bundling, fall back to a safe single-episode coverage
      const errMsg = err instanceof Error ? err.message : String(err)
      logger.warn('Episode bundling/validation failed — falling back to single-episode', {
        jobId,
        error: errMsg,
      })
      const fallback: EpisodeBreakPlan = {
        episodes: [
          {
            episodeNumber: 1,
            title: 'Episode 1',
            description: '',
            startPanelIndex: 1,
            endPanelIndex: Math.max(1, totalPanels),
          } as unknown as EpisodeBreakPlan['episodes'][number],
        ],
      }
      bundled = fallback
    }

    logger.info('Episode break estimation completed', {
      jobId,
      totalEpisodes: bundled.episodes.length,
      episodes: bundled.episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })),
    })

    return {
      success: true,
      data: {
        episodeBreaks: bundled,
        totalEpisodes: bundled.episodes.length,
      },
    }
  }

  /**
   * Sliding window episode break estimation for larger scripts
   */
  private async estimateEpisodeBreaksWithSlidingWindow(
    combinedScript: NewMangaScript,
    segmentationConfig: ScriptSegmentationConfig,
    context: StepContext,
    appCfg: AppConfig,
    episodeCfg: EpisodeConfig,
  ): Promise<StepExecutionResult<EpisodeBreakResult>> {
    const { jobId, logger } = context

    // Segment the script
    const segments = segmentScript(combinedScript, segmentationConfig)
    logger.info('Script segmented for episode break estimation', {
      jobId,
      totalSegments: segments.length,
      segmentSizes: segments.map((s) => s.script.panels?.length || 0),
    })

    const allEpisodes: EpisodeBreakPlan['episodes'] = []
    let episodeNumberOffset = 0

    for (const segment of segments) {
      logger.info('Processing segment for episode breaks', {
        jobId,
        segmentIndex: segment.segmentIndex,
        panelIndices: `${segment.panelIndices[0]}-${segment.panelIndices[segment.panelIndices.length - 1]}`,
        panelCount: segment.script.panels?.length || 0,
      })

      // Create a copy of the segment script with renumbered panels (1-based for LLM)
      const segmentScriptWithRenumberedPanels: NewMangaScript = {
        ...segment.script,
        panels:
          segment.script.panels?.map((panel, index) => ({
            ...panel,
            no: index + 1, // Renumber panels starting from 1 for this segment
          })) || [],
      }

      // Estimate episode breaks for this segment
      const segmentResult = await this.estimateEpisodeBreaksDirect(
        segmentScriptWithRenumberedPanels,
        context,
        appCfg,
        episodeCfg,
      )
      if (!segmentResult.success) {
        throw new Error(
          `Episode break estimation failed for segment ${segment.segmentIndex}: ${segmentResult.error}`,
        )
      }

      // Adjust episode indices to global panel indices and episode numbers
      const adjustedEpisodes = segmentResult.data.episodeBreaks.episodes.map((episode) => ({
        ...episode,
        episodeNumber: episode.episodeNumber + episodeNumberOffset,
        startPanelIndex: segment.panelIndices[episode.startPanelIndex - 1] + 1, // Convert to 1-based global index
        endPanelIndex: segment.panelIndices[episode.endPanelIndex - 1] + 1, // Convert to 1-based global index
      }))

      allEpisodes.push(...adjustedEpisodes)
      episodeNumberOffset = Math.max(...adjustedEpisodes.map((ep) => ep.episodeNumber))

      logger.info('Segment episode breaks processed', {
        jobId,
        segmentIndex: segment.segmentIndex,
        episodesFound: adjustedEpisodes.length,
        episodeNumbers: adjustedEpisodes.map((ep) => ep.episodeNumber),
      })
    }

    // Create final result
    const finalResult: EpisodeBreakPlan = { episodes: allEpisodes }

    // Normalize merged result to ensure continuity and bounds
    const totalPanels = combinedScript.panels?.length || 0
    const normalized = this.normalizeEpisodeBreaks(finalResult, totalPanels)

    const bundled = this.bundleAndValidate(
      normalized,
      totalPanels,
      context,
      appCfg,
      episodeCfg,
      'Merged episode break validation',
    )

    logger.info('Sliding window episode break estimation completed', {
      jobId,
      totalEpisodes: bundled.episodes.length,
      totalSegments: segments.length,
      episodes: bundled.episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })),
    })

    return {
      success: true,
      data: {
        episodeBreaks: bundled,
        totalEpisodes: bundled.episodes.length,
      },
    }
  }

  /**
   * Validate episode breaks
   */
  private validateEpisodeBreaks(
    episodeBreaks: EpisodeBreakPlan,
    totalPanels: number,
    cfg?: EpisodeConfig,
  ): { valid: boolean; issues: string[] } {
    const safeCfg = cfg ?? this.getEpisodeCfgSafe()
    const issues: string[] = []

    // Check if episodes cover all panels
    // sort() は破壊的なためコピーしてからソートする（toSorted は TS/lib 設定に依存するため未使用）
    type Ep = EpisodeBreakPlan['episodes'][number]
    const sortedEpisodes = [...episodeBreaks.episodes].sort(
      (a: Ep, b: Ep) => a.episodeNumber - b.episodeNumber,
    )

    // Check continuous coverage
    let expectedStart = 1
    for (const episode of sortedEpisodes) {
      if (episode.startPanelIndex !== expectedStart) {
        issues.push(
          `Episode ${episode.episodeNumber}: expected start ${expectedStart}, got ${episode.startPanelIndex}`,
        )
      }

      if (episode.startPanelIndex > episode.endPanelIndex) {
        issues.push(
          `Episode ${episode.episodeNumber}: start ${episode.startPanelIndex} > end ${episode.endPanelIndex}`,
        )
      }

      // Check episode length constraints
      const episodeLength = episode.endPanelIndex - episode.startPanelIndex + 1
      // For very small scripts, accept any length as long as coverage is continuous
      if (
        totalPanels > safeCfg.smallPanelThreshold &&
        episodeLength < safeCfg.minPanelsPerEpisode
      ) {
        issues.push(`Episode ${episode.episodeNumber}: too short (${episodeLength} panels)`)
      }
      if (episodeLength > safeCfg.maxPanelsPerEpisode) {
        issues.push(`Episode ${episode.episodeNumber}: too long (${episodeLength} panels)`)
      }

      expectedStart = episode.endPanelIndex + 1
    }

    // Check if last episode covers all panels
    if (sortedEpisodes.length > 0) {
      const lastEpisode = sortedEpisodes[sortedEpisodes.length - 1]
      if (lastEpisode.endPanelIndex !== totalPanels) {
        issues.push(
          `Last episode ends at ${lastEpisode.endPanelIndex}, but total panels is ${totalPanels}`,
        )
      }
    }

    return { valid: issues.length === 0, issues }
  }

  /**
   * Normalize episode breaks to enforce:
   * - indices within [1, totalPanels]
   * - continuous coverage without gaps (start = previous end + 1)
   * - end >= start for each episode
   * - last episode ends at totalPanels
   */
  private normalizeEpisodeBreaks(
    episodeBreaks: EpisodeBreakPlan,
    totalPanels: number,
  ): EpisodeBreakPlan {
    if (totalPanels <= 0 || episodeBreaks.episodes.length === 0) return episodeBreaks

    // Sort by episodeNumber (stable) to ensure deterministic order
    const sorted = [...episodeBreaks.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)

    // Step 1: collect candidate starts, clamp and deduplicate while keeping order
    const starts: number[] = []
    let last = 0
    for (const ep of sorted) {
      const s = Math.max(1, Math.min(ep.startPanelIndex, totalPanels))
      if (s > last) {
        starts.push(s)
        last = s
      }
    }
    if (starts.length === 0 || starts[0] !== 1) {
      starts.unshift(1)
    }

    // Step 2: build normalized episodes strictly from unique, ordered starts
    //  - 複数エピソード: 「次の開始-1」まで連続カバレッジ
    //  - 単一エピソード: LLM指定のendを尊重（totalPanelsまで強制拡張しない）
    const normalized = starts.map((start, idx) => {
      const base = sorted[Math.min(idx, sorted.length - 1)]
      if (starts.length === 1) {
        const endCandidate = Math.max(start, base.endPanelIndex)
        const end = Math.min(totalPanels, endCandidate)
        return { ...base, startPanelIndex: start, endPanelIndex: end }
      }
      const nextStart = idx + 1 < starts.length ? starts[idx + 1] : totalPanels + 1
      const end = Math.min(totalPanels, Math.max(start, nextStart - 1))
      return { ...base, startPanelIndex: start, endPanelIndex: end }
    })

    return { episodes: normalized }
  }

  /**
   * Enforce maximum episode length by deterministically splitting
   * episodes that exceed the configured maximum.
   * This is not a fallback; it guarantees constraints before validation.
   */
  private enforceEpisodeMaxLength(
    episodeBreaks: EpisodeBreakPlan,
    cfg: EpisodeConfig,
  ): EpisodeBreakPlan {
    const maxLen = cfg.maxPanelsPerEpisode
    if (episodeBreaks.episodes.length === 0) return episodeBreaks

    // Work on a copy sorted by episodeNumber
    const sorted = [...episodeBreaks.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
    const output: EpisodeBreakPlan['episodes'] = []

    for (const ep of sorted) {
      const start = ep.startPanelIndex
      const end = ep.endPanelIndex
      let cursor = start

      while (cursor <= end) {
        const sliceStart = cursor
        const sliceEnd = Math.min(end, sliceStart + maxLen - 1)
        output.push({
          ...ep,
          startPanelIndex: sliceStart,
          endPanelIndex: sliceEnd,
        })
        cursor = sliceEnd + 1
      }
    }

    // Renumber sequentially to keep deterministic order
    const renumbered = output.map((e, idx) => ({ ...e, episodeNumber: idx + 1 }))
    return { episodes: renumbered }
  }

  /**
   * Bundle episodes based on page count requirements
   * - Episodes with < 20 pages are merged with the next episode
   * - If the last episode has < 20 pages, it's merged with the previous episode
   * - Episode numbers are renumbered after bundling
   */
  private bundleEpisodesByPageCount(
    episodeBreaks: EpisodeBreakPlan,
    context: StepContext,
    bundlingConfig: BundlingConfig,
  ): EpisodeBreakPlan {
    const { jobId, logger } = context

    // Skip bundling if disabled
    if (!bundlingConfig.enabled) {
      logger.info('Episode bundling disabled by configuration', { jobId })
      return episodeBreaks
    }

    if (episodeBreaks.episodes.length <= 1) {
      logger.info('No bundling needed for single episode', { jobId })
      return episodeBreaks
    }

    const bundledEpisodes = [...episodeBreaks.episodes].sort(
      (a, b) => a.episodeNumber - b.episodeNumber,
    )
    const toRemove = new Set<number>()

    logger.info('Starting episode bundling process', {
      jobId,
      originalEpisodes: bundledEpisodes.length,
      minPageCount: bundlingConfig.minPageCount,
    })

    // First pass: merge episodes with < minPageCount with next episode
    for (let i = 0; i < bundledEpisodes.length - 1; i++) {
      if (toRemove.has(i)) continue

      const currentEpisode = bundledEpisodes[i]
      const currentPageCount = currentEpisode.endPanelIndex - currentEpisode.startPanelIndex + 1

      if (currentPageCount < bundlingConfig.minPageCount) {
        // Find next episode that's not already merged
        const nextIndex = i + 1

        if (nextIndex < bundledEpisodes.length) {
          const nextEpisode = bundledEpisodes[nextIndex]

          // Merge current episode with next episode
          bundledEpisodes[nextIndex] = {
            ...nextEpisode,
            startPanelIndex: currentEpisode.startPanelIndex,
            title: currentEpisode.title || nextEpisode.title,
            description: currentEpisode.description || nextEpisode.description,
          }

          toRemove.add(i)

          const newPageCount =
            bundledEpisodes[nextIndex].endPanelIndex -
            bundledEpisodes[nextIndex].startPanelIndex +
            1
          logger.info('Merged episode with next episode', {
            jobId,
            mergedEpisode: currentEpisode.episodeNumber,
            intoEpisode: nextEpisode.episodeNumber,
            originalPageCounts: [
              currentPageCount,
              nextEpisode.endPanelIndex - nextEpisode.startPanelIndex + 1,
            ],
            newPageCount,
          })
        }
      }
    }

    // Check if the last episode (after first pass merges) has < minPageCount
    // Find the last non-removed episode
    let lastIndex = bundledEpisodes.length - 1
    while (lastIndex >= 0 && toRemove.has(lastIndex)) {
      lastIndex--
    }

    if (lastIndex >= 0) {
      const lastEpisode = bundledEpisodes[lastIndex]
      const lastPageCount = lastEpisode.endPanelIndex - lastEpisode.startPanelIndex + 1

      if (lastPageCount < bundlingConfig.minPageCount) {
        // Find the previous non-removed episode
        let prevIndex = lastIndex - 1
        while (prevIndex >= 0 && toRemove.has(prevIndex)) {
          prevIndex--
        }

        if (prevIndex >= 0) {
          const prevEpisode = bundledEpisodes[prevIndex]

          // Merge last episode with previous episode
          bundledEpisodes[prevIndex] = {
            ...prevEpisode,
            endPanelIndex: lastEpisode.endPanelIndex,
            title: prevEpisode.title || lastEpisode.title,
            description: prevEpisode.description || lastEpisode.description,
          }

          toRemove.add(lastIndex)

          const newPageCount =
            bundledEpisodes[prevIndex].endPanelIndex -
            bundledEpisodes[prevIndex].startPanelIndex +
            1
          logger.info('Merged last episode with previous episode', {
            jobId,
            mergedEpisode: lastEpisode.episodeNumber,
            intoPreviousEpisode: prevEpisode.episodeNumber,
            originalPageCounts: [
              prevEpisode.endPanelIndex - prevEpisode.startPanelIndex + 1,
              lastPageCount,
            ],
            newPageCount,
          })
        }
      }
    }

    // Filter out removed episodes and renumber
    const finalEpisodes = bundledEpisodes
      .filter((_, index) => !toRemove.has(index))
      .map((episode, index) => ({
        ...episode,
        episodeNumber: index + 1,
      }))

    logger.info('Episode bundling completed', {
      jobId,
      originalEpisodeCount: bundledEpisodes.length,
      finalEpisodeCount: finalEpisodes.length,
      removedCount: toRemove.size,
      finalEpisodes: finalEpisodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        pageCount: ep.endPanelIndex - ep.startPanelIndex + 1,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })),
    })

    return { episodes: finalEpisodes }
  }

  // Read app config via a typed helper (single source per run)
  private getAppConfig(): AppConfig {
    try {
      const cfg = getAppConfigWithOverrides() as unknown as AppConfig | undefined
      if (cfg && typeof cfg === 'object') return cfg
    } catch {
      // fall through to default
    }
    // Minimal safe defaults for tests or when config mocking is incomplete
    return {
      llm: { episodeBreakEstimation: { systemPrompt: '', userPromptTemplate: '' } },
      scriptSegmentation: DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
      episodeBundling: { minPageCount: 20, enabled: true },
    }
  }

  // Guard against missing episode config in certain tests by providing sane defaults
  private getEpisodeCfgSafe(): NonNullable<EpisodeConfig> {
    try {
      const cfg = getEpisodeConfig()
      if (cfg) return cfg
    } catch {
      // ignore
    }
    return {
      targetCharsPerEpisode: 0,
      minCharsPerEpisode: 0,
      maxCharsPerEpisode: 0,
      smallPanelThreshold: 400,
      minPanelsPerEpisode: 10,
      maxPanelsPerEpisode: 50,
    }
  }

  /**
   * Shared helper to enforce max length, bundle by page count, validate, and throw on failure.
   * Returns a valid, bundled EpisodeBreakPlan on success.
   */
  private bundleAndValidate(
    breaks: EpisodeBreakPlan,
    totalPanels: number,
    context: StepContext,
    appCfg: AppConfig,
    episodeCfg: EpisodeConfig,
    errorContext: string,
  ): EpisodeBreakPlan {
    const { jobId, logger } = context
    const lengthConstrained = this.enforceEpisodeMaxLength(breaks, episodeCfg)
    const bundled = this.bundleEpisodesByPageCount(
      lengthConstrained,
      context,
      appCfg.episodeBundling || { minPageCount: 20, enabled: true },
    )

    const validation = this.validateEpisodeBreaks(bundled, totalPanels, episodeCfg)
    if (!validation.valid) {
      logger.error(`${errorContext} failed after bundling`, {
        jobId,
        issues: validation.issues,
        totalPanels,
      })
      throw new Error(`${errorContext} failed after bundling: ${validation.issues.join(', ')}`)
    }

    return bundled
  }
}

// Minimal config types used by this step (no any)
interface AppConfig {
  llm: {
    episodeBreakEstimation?: { systemPrompt?: string; userPromptTemplate?: string }
  }
  scriptSegmentation?: ScriptSegmentationConfig
  episodeBundling?: BundlingConfig
}

interface BundlingConfig {
  minPageCount: number
  enabled: boolean
}
