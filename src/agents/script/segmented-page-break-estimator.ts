/**
 * Segmented Page Break Estimator
 *
 * Processes long scripts by segmenting them and estimating page breaks for each segment,
 * then merging the results into a complete PageBreakV2.
 */

import type { NewMangaScript, PageBreakV2 } from '../../types/script'
import type { ScriptSegment } from './script-segmenter'
import {
  segmentScript,
  estimateSegmentJsonSize,
  validateSegments,
  DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
  type ScriptSegmentationConfig,
} from './script-segmenter'
import { calculateImportanceBasedPageBreaks } from './importance-based-page-break'

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
          content: script.panels?.[0]?.cut || 'デモコンテンツ',
          dialogue: [
            {
              speaker: '太郎',
              text: 'やってみよう！',
            },
          ],
        },
        {
          pageNumber: 1,
          panelIndex: 2,
          content: script.panels?.[1]?.cut || '太郎のセリフ',
          dialogue: [
            {
              speaker: '太郎',
              text:
                (script.panels?.[1]?.dialogue?.[0] || '太郎: セリフ')
                  .split(':')
                  .slice(1)
                  .join(':')
                  .trim() || '太郎のセリフ',
            },
          ],
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

  const wasSegmented = segments.length > 1 || opts.forceSegmentation
  const jsonSizes = segments.map(estimateSegmentJsonSize)

  // If not segmented, use original estimator logic
  if (!wasSegmented) {
    const pageBreaks = await estimateSingleSegmentPageBreaks(segments[0], opts)
    return {
      pageBreaks,
      segmentationInfo: {
        wasSegmented: false,
        segmentCount: 1,
        totalPanels: script.panels?.length || 0,
        avgSegmentSize: script.panels?.length || 0,
        maxJsonSize: jsonSizes[0] || 0,
      },
    }
  }

  // Process each segment
  const segmentResults: PageBreakV2[] = []

  for (const segment of segments) {
    try {
      const segmentPageBreaks = await estimateSingleSegmentPageBreaks(segment, opts)
      segmentResults.push(segmentPageBreaks)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Segment ${segment.segmentIndex} page break estimation failed: ${msg}`)
    }
  }

  // Merge segments into final result
  const mergedPageBreaks = mergeSegmentPageBreaks(segmentResults, segments)

  return {
    pageBreaks: mergedPageBreaks,
    segmentationInfo: {
      wasSegmented: true,
      segmentCount: segments.length,
      totalPanels: script.panels?.length || 0,
      avgSegmentSize: Math.round((script.panels?.length || 0) / segments.length),
      maxJsonSize: Math.max(...jsonSizes),
    },
  }
}

/**
 * Estimates page breaks for a single segment
 */
async function estimateSingleSegmentPageBreaks(
  segment: ScriptSegment,
  _opts: SegmentedPageBreakOptions,
): Promise<PageBreakV2> {
  // Always use importance-based calculation (LLM estimation is deprecated)
  const importanceResult = calculateImportanceBasedPageBreaks(segment.script)
  return importanceResult.pageBreaks
}

/**
 * Merges multiple segment page break results into a final result
 */
function mergeSegmentPageBreaks(
  segmentResults: PageBreakV2[],
  segments: ScriptSegment[],
): PageBreakV2 {
  if (segmentResults.length === 0) {
    throw new Error('No segment results to merge')
  }

  if (segmentResults.length === 1) {
    return segmentResults[0]
  }

  const mergedPanels = []
  let currentPageOffset = 0

  for (let i = 0; i < segmentResults.length; i++) {
    const segmentResult = segmentResults[i]
    const _segment = segments[i]

    // Adjust page numbers to avoid conflicts
    const adjustedPanels = segmentResult.panels.map((panel) => ({
      ...panel,
      pageNumber: panel.pageNumber + currentPageOffset,
    }))

    mergedPanels.push(...adjustedPanels)

    // Update offset for next segment
    const maxPageInSegment = Math.max(...adjustedPanels.map((p) => p.pageNumber))
    currentPageOffset = maxPageInSegment

    // Log segment merge info if needed by caller
  }

  // Log final merge result if needed by caller

  return {
    panels: mergedPanels,
  }
}
