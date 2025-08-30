/**
 * Script Segmentation for Long Scripts
 *
 * Splits large NewMangaScript into manageable segments for PageBreak processing.
 * Different from text "chunks" - these are script "segments" for processing efficiency.
 */

import type { NewMangaScript } from '../../types/script'

/**
 * Script segment with context for processing
 */
export interface ScriptSegment {
  /** Segment index (0-based) */
  segmentIndex: number
  /** Total number of segments */
  totalSegments: number
  /** Panel indices included in this segment (0-based in original script) */
  panelIndices: number[]
  /** Segmented script with only relevant panels */
  script: NewMangaScript
  /** Context panels from previous segment for continuity */
  contextBefore?: NewMangaScript['panels']
  /** Context panels from next segment for continuity */
  contextAfter?: NewMangaScript['panels']
}

/**
 * Configuration for script segmentation
 */
export interface ScriptSegmentationConfig {
  /** Maximum panels per segment (default: 400) */
  maxPanelsPerSegment: number
  /** Overlap panels for context (default: 50) */
  contextOverlapPanels: number
  /** Minimum panels to trigger segmentation (default: 400) */
  minPanelsForSegmentation: number
  /** Minimum trailing segment size to avoid merging (default: 320) */
  minTrailingSegmentSize?: number
}

/**
 * Default configuration for script segmentation
 */
export const DEFAULT_SCRIPT_SEGMENTATION_CONFIG: ScriptSegmentationConfig = {
  maxPanelsPerSegment: 400,
  contextOverlapPanels: 50,
  minPanelsForSegmentation: 400,
  minTrailingSegmentSize: 320,
}

/**
 * Segments a large script into manageable pieces for processing
 */
export function segmentScript(
  script: NewMangaScript,
  config: ScriptSegmentationConfig = DEFAULT_SCRIPT_SEGMENTATION_CONFIG,
): ScriptSegment[] {
  const panels = script.panels || []

  // If script is small enough, return as single segment
  if (panels.length <= config.minPanelsForSegmentation) {
    return [
      {
        segmentIndex: 0,
        totalSegments: 1,
        panelIndices: panels.map((_, i) => i),
        script,
      },
    ]
  }

  const segments: ScriptSegment[] = []
  const totalPanels = panels.length
  const segmentSize = config.maxPanelsPerSegment
  const overlap = config.contextOverlapPanels
  const minTrailingSize = config.minTrailingSegmentSize || Math.floor(segmentSize * 0.8)

  for (let startIdx = 0; startIdx < totalPanels; startIdx += segmentSize) {
    let endIdx = Math.min(startIdx + segmentSize, totalPanels)

    // Check if this would create a small trailing segment
    const remainingPanels = totalPanels - endIdx
    if (remainingPanels > 0 && remainingPanels < minTrailingSize) {
      // Merge the trailing panels into the current segment
      endIdx = totalPanels
    }

    const segmentIndex = segments.length

    // Core panels for this segment
    const corePanels = panels.slice(startIdx, endIdx)
    const coreIndices = Array.from({ length: endIdx - startIdx }, (_, i) => startIdx + i)

    // Context panels
    const contextBefore =
      startIdx > 0 ? panels.slice(Math.max(0, startIdx - overlap), startIdx) : undefined
    const contextAfter =
      endIdx < totalPanels
        ? panels.slice(endIdx, Math.min(totalPanels, endIdx + overlap))
        : undefined

    // Create segmented script
    const segmentedScript: NewMangaScript = {
      ...script,
      panels: corePanels,
    }

    segments.push({
      segmentIndex,
      totalSegments: 0, // Will be set after all segments are created
      panelIndices: coreIndices,
      script: segmentedScript,
      contextBefore,
      contextAfter,
    })

    // If we've included all panels in this segment, break
    if (endIdx >= totalPanels) {
      break
    }
  }

  // Set total segments count
  segments.forEach((segment) => {
    segment.totalSegments = segments.length
  })

  return segments
}

/**
 * Estimates the JSON size of a script segment for LLM processing
 */
export function estimateSegmentJsonSize(segment: ScriptSegment): number {
  const scriptJson = JSON.stringify(segment.script, null, 2)
  return scriptJson.length
}

/**
 * Validates if segments are properly formed
 */
export function validateSegments(segments: ScriptSegment[]): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []

  if (segments.length === 0) {
    issues.push('No segments provided')
    return { valid: false, issues }
  }

  // Check segment indices
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (segment.segmentIndex !== i) {
      issues.push(`Segment ${i} has incorrect segmentIndex: ${segment.segmentIndex}`)
    }
    if (segment.totalSegments !== segments.length) {
      issues.push(`Segment ${i} has incorrect totalSegments: ${segment.totalSegments}`)
    }
  }

  // Check panel coverage
  const allCoveredPanels = new Set<number>()
  for (const segment of segments) {
    for (const panelIdx of segment.panelIndices) {
      if (allCoveredPanels.has(panelIdx)) {
        issues.push(`Panel ${panelIdx} is covered by multiple segments`)
      }
      allCoveredPanels.add(panelIdx)
    }
  }

  return { valid: issues.length === 0, issues }
}
