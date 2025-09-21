/**
 * Importance-based Page Break Calculator
 *
 * Replaces LLM-based page break estimation with rule-based calculation using importance values.
 * Logic: Sum importance values until they reach 6, then create a new page.
 */

import type { NewMangaScript, PageBreakV2 } from '../../types/script'
import { buildPanelContentFromScript, parseDialogueAndNarration } from './dialogue-utils'

/**
 * Result of importance-based page break calculation
 */
export interface ImportancePageBreakResult {
  pageBreaks: PageBreakV2
  stats: {
    totalPages: number
    totalPanels: number
    averagePanelsPerPage: number
    importanceDistribution: Record<number, number>
    /** Remaining importance sum to carry over to next segment */
    remainingImportance: number
    /** Indicates the remaining importance belongs to a page that has not received any panels yet */
    carryIntoNewPage: boolean
  }
}

/**
 * Calculate page breaks based on importance values
 */
export function calculateImportanceBasedPageBreaks(
  script: NewMangaScript,
  initialImportance = 0,
): ImportancePageBreakResult {
  const PAGE_IMPORTANCE_LIMIT = 6
  if (!script.panels || script.panels.length === 0) {
    return {
      pageBreaks: { panels: [] },
      stats: {
        totalPages: 0,
        totalPanels: 0,
        averagePanelsPerPage: 0,
        importanceDistribution: {},
        remainingImportance: Math.max(0, Math.min(PAGE_IMPORTANCE_LIMIT - 1, initialImportance)),
        carryIntoNewPage: false,
      },
    }
  }

  const resultPanels: PageBreakV2['panels'] = []
  const importanceDistribution: Record<number, number> = {}

  let currentPage = 1
  let currentPanelIndex = 1
  let importanceSum = Math.max(0, Math.min(PAGE_IMPORTANCE_LIMIT - 1, initialImportance))
  let hasPanelsOnCurrentPage = false

  for (const panel of script.panels) {
    const importance = Math.max(1, Math.min(PAGE_IMPORTANCE_LIMIT, panel.importance || 1))

    // Track importance distribution
    importanceDistribution[importance] = (importanceDistribution[importance] || 0) + 1

    // dialogue/narration を統合して構造化
    const dialogue = parseDialogueAndNarration(panel.dialogue, panel.narration)

    resultPanels.push({
      pageNumber: currentPage,
      panelIndex: currentPanelIndex,
      content: buildPanelContentFromScript({ cut: panel.cut, camera: panel.camera }),
      dialogue,
      // Add SFX support (will be added to schema later)
      ...(panel.sfx && { sfx: panel.sfx }),
    })

    hasPanelsOnCurrentPage = true
    importanceSum += importance

    // Check if we should move to next page
    if (importanceSum >= PAGE_IMPORTANCE_LIMIT) {
      const overflow = importanceSum - PAGE_IMPORTANCE_LIMIT
      currentPage++
      currentPanelIndex = 1
      importanceSum = overflow
      hasPanelsOnCurrentPage = false
    } else {
      currentPanelIndex++
    }
  }

  const totalPanels = script.panels.length
  const maxPageNumber = resultPanels.reduce((max, panel) => Math.max(max, panel.pageNumber), 0)
  const carryIntoNewPage = importanceSum > 0 && !hasPanelsOnCurrentPage
  const totalPages = maxPageNumber + (carryIntoNewPage ? 1 : 0)
  const averagePanelsPerPage = totalPages > 0 ? totalPanels / totalPages : 0

  return {
    pageBreaks: { panels: resultPanels },
    stats: {
      totalPages,
      totalPanels,
      averagePanelsPerPage: Math.round(averagePanelsPerPage * 100) / 100,
      importanceDistribution,
      remainingImportance: importanceSum,
      carryIntoNewPage,
    },
  }
}

/**
 * Validate importance values in script panels
 */
export function validateScriptImportance(script: NewMangaScript): {
  valid: boolean
  issues: string[]
  correctedPanels: number
} {
  const issues: string[] = []
  let correctedPanels = 0

  for (let i = 0; i < script.panels.length; i++) {
    const panel = script.panels[i]
    const originalImportance = panel.importance

    if (typeof originalImportance !== 'number' || !Number.isFinite(originalImportance)) {
      issues.push(
        `Panel ${i + 1}: invalid importance value "${originalImportance}", using default 1`,
      )
      correctedPanels++
    } else if (originalImportance < 1 || originalImportance > 6) {
      const clamped = Math.max(1, Math.min(6, Math.round(originalImportance)))
      issues.push(
        `Panel ${i + 1}: importance ${originalImportance} out of range, corrected to ${clamped}`,
      )
      correctedPanels++
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    correctedPanels,
  }
}

/**
 * Analyze importance distribution for debugging
 */
export function analyzeImportanceDistribution(script: NewMangaScript): {
  distribution: Record<number, number>
  totalPanels: number
  averageImportance: number
  estimatedPages: number
} {
  const distribution: Record<number, number> = {}
  let totalImportance = 0

  for (const panel of script.panels) {
    const importance = Math.max(1, Math.min(6, panel.importance || 1))
    distribution[importance] = (distribution[importance] || 0) + 1
    totalImportance += importance
  }

  const totalPanels = script.panels.length
  const averageImportance = totalPanels > 0 ? totalImportance / totalPanels : 0
  const estimatedPages = Math.ceil(totalImportance / 6)

  return {
    distribution,
    totalPanels,
    averageImportance: Math.round(averageImportance * 100) / 100,
    estimatedPages,
  }
}
