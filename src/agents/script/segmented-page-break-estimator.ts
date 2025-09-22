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
      const adjustedPanels = segmentResult.pageBreaks.panels.map((p: PageBreakV2['panels'][number]) => ({
        ...p,
        pageNumber: p.pageNumber + pageOffset,
      }))
      mergedPanels.push(...adjustedPanels)

      // Determine carry: if last segment page was 'open' (not saturated), we keep its residual importance.
      // If the last page was saturated (exact multiple of 6), we MUST reset carry to 0, otherwise we incorrectly
      // start the next segment with an initialImportance equal to the full limit, causing an immediate page break
      // and creating a low-importance standalone page (root cause of issue: page with importance 3 alone).
      importanceCarry = segmentResult.stats.carryIntoNewPage
        ? 0
        : segmentResult.stats.lastPageTotalImportance
      const maxPage = segmentResult.pageBreaks.panels.reduce(
        (m: number, p: PageBreakV2['panels'][number]) => Math.max(m, p.pageNumber),
        0,
      )
      // If the last page was saturated (carryIntoNewPage true), all pages are completed -> offset by maxPage
      // If not saturated and has panels, we offset by (maxPage - 1) so next segment continues the partial page
      const saturated = segmentResult.stats.carryIntoNewPage
      const completedPages = saturated ? maxPage : Math.max(0, maxPage - 1)
      pageOffset += completedPages
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`Segment ${segment.segmentIndex} page break estimation failed: ${msg}`)
    }
  }

  // Runtime invariant: except for the last page, each page's cumulative original importance must reach >= 6
  const pageGroups = new Map<number, typeof mergedPanels>()
  for (const p of mergedPanels) {
    if (!pageGroups.has(p.pageNumber)) pageGroups.set(p.pageNumber, [])
    const arr = pageGroups.get(p.pageNumber)
    if (arr) arr.push(p)
  }
  const maxPage = Math.max(0, ...Array.from(pageGroups.keys()))
  const originalPanels = script.panels || []
  for (const [pageNo, panels] of pageGroups.entries()) {
    if (pageNo === maxPage) continue // last page may be < 6 (residual)
    let sum = 0
    for (const bp of panels) {
      const idx = bp.panelIndex - 1
      const original = originalPanels[idx]
      if (original) {
        const imp = Math.max(1, Math.min(6, original.importance || 1))
        sum += imp
      }
    }
    if (sum < 6) {
      throw new Error(
        `Importance pagination invariant violated: page ${pageNo} total importance=${sum} (<6). This indicates a segmentation/merge bug.`,
      )
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
