/**
 * Segmented Page Break Estimator
 *
 * Processes long scripts by segmenting them and estimating page breaks for each segment,
 * then merging the results into a complete PageBreakV2.
 */

import type { NewMangaScript, PageBreakV2 } from '../../types/script'
import { buildPanelContentFromScript, parseDialogueAndNarration } from './dialogue-utils'
import { calculateImportanceBasedPageBreaks } from './importance-based-page-break'
import {
  DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
  estimateSegmentJsonSize,
  type ScriptSegmentationConfig,
  segmentScript,
  validateSegments,
} from './script-segmenter'

/**
 * Options for segmented page break estimation
 */
export interface SegmentedPageBreakOptions {
  jobId?: string
  episodeNumber?: number
  isDemo?: boolean
  /** Force segmentation even for small scripts (for testing) */
  forceSegmentation?: boolean
  /** Custom segmentation config */
  segmentationConfig?: Partial<ScriptSegmentationConfig>
  /** Use importance-based calculation instead of LLM estimation */
  useImportanceBased?: boolean
}

/**
 * Result of segmented page break estimation
 */
export interface SegmentedPageBreakResult {
  /** Final merged page breaks */
  pageBreaks: PageBreakV2
  /** Information about segmentation used */
  segmentationInfo: {
    wasSegmented: boolean
    segmentCount: number
    totalPanels: number
    avgSegmentSize: number
    maxJsonSize: number
  }
}

/**
 * Estimates page breaks for potentially long scripts using segmentation
 */
export async function estimatePageBreaksSegmented(
  script: NewMangaScript,
  opts: SegmentedPageBreakOptions = {},
): Promise<SegmentedPageBreakResult> {
  // Demo mode: return fixed page break plan for testing
  if (opts?.isDemo || process.env.NODE_ENV === 'test') {
    const demoPageBreaks: PageBreakV2 = {
      panels: [
        {
          pageNumber: 1,
          panelIndex: 1,
          content:
            buildPanelContentFromScript({
              cut: script.panels?.[0]?.cut,
              camera: script.panels?.[0]?.camera,
            }) || 'デモコンテンツ',
          dialogue: parseDialogueAndNarration(
            script.panels?.[0]?.dialogue || ['太郎: やってみよう！'],
            script.panels?.[0]?.narration,
          ),
        },
        {
          pageNumber: 1,
          panelIndex: 2,
          content:
            buildPanelContentFromScript({
              cut: script.panels?.[1]?.cut,
              camera: script.panels?.[1]?.camera,
            }) || '太郎のセリフ',
          dialogue: parseDialogueAndNarration(
            script.panels?.[1]?.dialogue || ['太郎: セリフ'],
            script.panels?.[1]?.narration,
          ),
        },
      ],
    }

    return {
      pageBreaks: demoPageBreaks,
      segmentationInfo: {
        wasSegmented: false,
        segmentCount: 1,
        totalPanels: script.panels?.length || 0,
        avgSegmentSize: script.panels?.length || 0,
        maxJsonSize: JSON.stringify(script, null, 2).length,
      },
    }
  }

  // Read segmentation config from environment or use defaults
  const appSegmentationCfg = {}

  const segmentationConfig: ScriptSegmentationConfig = {
    ...DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
    ...appSegmentationCfg,
    ...opts.segmentationConfig,
  }

  // Segment the script
  const segments = segmentScript(script, segmentationConfig)
  const validation = validateSegments(segments)

  if (!validation.valid) {
    throw new Error(`Script segmentation failed: ${validation.issues.join(', ')}`)
  }

  const wasSegmented = segments.length > 1 || !!opts.forceSegmentation
  const jsonSizes = segments.map(estimateSegmentJsonSize)

  // Process segments sequentially, carrying over importance sum
  let importanceCarry = 0
  let pageOffset = 0
  const mergedPanels: PageBreakV2['panels'] = []

  for (const segment of segments) {
    try {
      const segmentResult = calculateImportanceBasedPageBreaks(segment.script, importanceCarry)
      const adjustedPanels = segmentResult.pageBreaks.panels.map((p) => ({
        ...p,
        pageNumber: p.pageNumber + pageOffset,
      }))
      mergedPanels.push(...adjustedPanels)

      importanceCarry = segmentResult.stats.remainingImportance
      const maxPage = segmentResult.pageBreaks.panels.reduce((m, p) => Math.max(m, p.pageNumber), 0)
      const completedPages = Math.max(0, maxPage - (importanceCarry > 0 ? 1 : 0))
      pageOffset += completedPages
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Segment ${segment.segmentIndex} page break estimation failed: ${msg}`)
    }
  }

  return {
    pageBreaks: { panels: mergedPanels },
    segmentationInfo: {
      wasSegmented,
      segmentCount: segments.length,
      totalPanels: script.panels?.length || 0,
      avgSegmentSize: Math.round((script.panels?.length || 0) / segments.length),
      maxJsonSize: Math.max(...jsonSizes),
    },
  }
}
