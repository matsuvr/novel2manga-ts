import type { z } from 'zod'
import {
  DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
  type ScriptSegmentationConfig,
  segmentScript,
} from '@/agents/script/script-segmenter'
import { DefaultLlmStructuredGenerator } from '@/agents/structured-generator'
import { getAppConfigWithOverrides } from '@/config'
import { EPISODE_CONSTANTS } from '@/config/constants'
import { getProviderForUseCase } from '@/config/llm.config'
import { type EpisodeBreakPlan, EpisodeBreakSchema, type NewMangaScript } from '@/types/script'
import type { PipelineStep, StepContext, StepExecutionResult } from './base-step'

export interface EpisodeBreakResult {
  episodeBreaks: EpisodeBreakPlan
  totalEpisodes: number
}

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
      logger.info('Starting episode break estimation', {
        jobId,
        panelCount: totalPanels,
      })

      // Small-script local rule: if panel count is small, confirm a single episode 1..N
      // This is NOT a fallback; it is a deterministic rule to avoid invalid LLM splits on tiny scripts.
      if (totalPanels > 0 && totalPanels <= EPISODE_CONSTANTS.SMALL_PANEL_THRESHOLD) {
        const plan: EpisodeBreakPlan = {
          episodes: [
            {
              episodeNumber: 1,
              title: undefined,
              startPanelIndex: 1,
              endPanelIndex: totalPanels,
              description: 'Auto-confirmed for small script',
            },
          ],
        }

        const normalized = this.normalizeEpisodeBreaks(plan, totalPanels)
        const validation = this.validateEpisodeBreaks(normalized, totalPanels)
        if (!validation.valid) {
          logger.error('Local small-script episode validation failed', {
            jobId,
            issues: validation.issues,
            totalPanels,
          })
          return {
            success: false,
            error: `Episode validation failed: ${validation.issues.join(', ')}`,
          }
        }

        logger.info('Episode break determined by small-script rule', {
          jobId,
          episodes: normalized.episodes.map((ep) => ({
            episodeNumber: ep.episodeNumber,
            panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
          })),
        })
        return {
          success: true,
          data: {
            episodeBreaks: normalized,
            totalEpisodes: normalized.episodes.length,
          },
        }
      }

      // Read segmentation config from app config
      const appCfg = getAppConfigWithOverrides()
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
        return await this.estimateEpisodeBreaksDirect(combinedScript, context)
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
  ): Promise<StepExecutionResult<EpisodeBreakResult>> {
    const { jobId, logger } = context

    // Use provider for episode break estimation
    const provider = getProviderForUseCase('episodeBreak')
    const generator = new DefaultLlmStructuredGenerator([provider])

    // Read prompts from app config
    const appCfg = getAppConfigWithOverrides()
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
    })

    if (!result || !result.episodes || result.episodes.length === 0) {
      throw new Error('Episode break estimation failed: no episodes detected')
    }

    // Normalize and then validate for strict continuity and bounds
    const totalPanels = combinedScript.panels?.length || 0
    const normalized = this.normalizeEpisodeBreaks(result, totalPanels)
    const validation = this.validateEpisodeBreaks(normalized, totalPanels)
    if (!validation.valid) {
      logger.error('Episode break validation failed after normalization', {
        jobId,
        issues: validation.issues,
        totalPanels,
      })
      throw new Error(`Episode break validation failed: ${validation.issues.join(', ')}`)
    }

    logger.info('Episode break estimation completed', {
      jobId,
      totalEpisodes: normalized.episodes.length,
      episodes: normalized.episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })),
    })

    return {
      success: true,
      data: {
        episodeBreaks: normalized,
        totalEpisodes: normalized.episodes.length,
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

    // Validate the merged results
    const validation = this.validateEpisodeBreaks(normalized, totalPanels)
    if (!validation.valid) {
      logger.error('Merged episode break validation failed', {
        jobId,
        issues: validation.issues,
      })
      throw new Error(`Merged episode break validation failed: ${validation.issues.join(', ')}`)
    }

    logger.info('Sliding window episode break estimation completed', {
      jobId,
      totalEpisodes: normalized.episodes.length,
      totalSegments: segments.length,
      episodes: normalized.episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        title: ep.title,
        panelRange: `${ep.startPanelIndex}-${ep.endPanelIndex}`,
      })),
    })

    return {
      success: true,
      data: {
        episodeBreaks: normalized,
        totalEpisodes: normalized.episodes.length,
      },
    }
  }

  /**
   * Validate episode breaks
   */
  private validateEpisodeBreaks(
    episodeBreaks: EpisodeBreakPlan,
    totalPanels: number,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = []

    // Check if episodes cover all panels
    const sortedEpisodes = episodeBreaks.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)

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
        totalPanels > EPISODE_CONSTANTS.SMALL_PANEL_THRESHOLD &&
        episodeLength < EPISODE_CONSTANTS.MIN_EPISODE_LENGTH
      ) {
        issues.push(`Episode ${episode.episodeNumber}: too short (${episodeLength} panels)`)
      }
      if (episodeLength > EPISODE_CONSTANTS.MAX_EPISODE_LENGTH) {
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

    // Step 2: build normalized episodes with deterministic ends = nextStart - 1
    const normalized = sorted.map((ep, idx) => {
      const start = idx < starts.length ? starts[idx] : starts[starts.length - 1]
      const nextStart = idx + 1 < starts.length ? starts[idx + 1] : totalPanels + 1
      const end = Math.min(totalPanels, Math.max(start, nextStart - 1))
      return { ...ep, startPanelIndex: start, endPanelIndex: end }
    })

    return { episodes: normalized }
  }
}
