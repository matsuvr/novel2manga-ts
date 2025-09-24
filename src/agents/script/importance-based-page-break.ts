/**
 * Importance-based Page Break Calculator
 *
 * Replaces LLM-based page break estimation with rule-based calculation using importance values.
 * Logic: Sum importance values until they reach 6, then create a new page.
 */

import { getAppConfigWithOverrides } from '@/config/app.config'
import type { NewMangaScript, PageBreakV2 } from '../../types/script'

// 旧 PageBreak 型参照を残している箇所への後方互換エイリアス
type PageBreak = PageBreakV2

import { buildPanelContentFromScript, parseDialogueAndNarration } from './dialogue-utils'

/**
 * Result of importance-based page break calculation
 */
interface ImportancePageBreakResult {
  pageBreaks: PageBreak
  stats: {
    totalPages: number
    totalPanels: number
    averagePanelsPerPage: number
    importanceDistribution: Record<number, number>
    lastPageTotalImportance: number
    /** true if the final produced page is NOT saturated (importance sum < limit) */
    lastPageOpen: boolean
    /** true if the final produced page ended exactly on a boundary (so next starts fresh) */
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
  const cfg = getAppConfigWithOverrides()
  const PAGE_IMPORTANCE_LIMIT = cfg.pagination.pageImportanceLimit
  if (!script.panels || script.panels.length === 0) {
    return {
      pageBreaks: { panels: [] },
      stats: {
        totalPages: 0,
        totalPanels: 0,
        averagePanelsPerPage: 0,
        importanceDistribution: {},
        lastPageTotalImportance: Math.max(0, Math.min(PAGE_IMPORTANCE_LIMIT - 1, initialImportance)),
        lastPageOpen: initialImportance > 0,
        carryIntoNewPage: initialImportance === 0 ? false : initialImportance >= PAGE_IMPORTANCE_LIMIT,
      },
    }
  }

  const resultPanels: PageBreakV2['panels'] = []
  const importanceDistribution: Record<number, number> = {}

  let currentPage = 1
  let importanceSum = Math.max(0, Math.min(PAGE_IMPORTANCE_LIMIT - 1, initialImportance))

  // 互換モードと厳格モード
  //  - 互換モード(デフォルト): パネルを加算後、合計 >= LIMIT になった時点でページをクローズ（結果として最終合計が LIMIT を超えることを許容）。
  //    既存テスト群はこの振る舞いを前提としている（例: 4,1,2 -> 7 を1ページに置く）。
  //  - 厳格モード(STRICT): 加算前に超過を検出し、新ページに送る（合計が LIMIT を超えない）。ユーザー要件で指摘された
  //    「4,5,4 のケースで 4 のみを最初のページにしたい」などを満たす。環境変数 IMPORTANCE_STRICT=1 で有効化。
  const strictMode = process.env.IMPORTANCE_STRICT === '1'

  for (let i = 0; i < script.panels.length; i++) {
    const panel = script.panels[i]
    const importance = Math.max(1, Math.min(PAGE_IMPORTANCE_LIMIT, panel.importance || 1))

    if (strictMode) {
      // STRICT: 事前判定で超過を避ける (現在はユーザー仕様では未使用、環境変数で明示有効時のみ)
      if (importanceSum + importance > PAGE_IMPORTANCE_LIMIT) {
        currentPage++
        importanceSum = 0
      }
    }

    // importance 分布記録（ページ番号は最終決定後）
    importanceDistribution[importance] = (importanceDistribution[importance] || 0) + 1

    const dialogue = parseDialogueAndNarration(panel.dialogue, panel.narration)
    resultPanels.push({
      pageNumber: currentPage,
      panelIndex: i + 1,
      content: buildPanelContentFromScript({ cut: panel.cut, camera: panel.camera }),
      dialogue,
      ...(panel.sfx && { sfx: panel.sfx }),
    })

    importanceSum += importance

    if (strictMode) {
      // STRICT: ちょうど一致でページを閉じる (超過は事前判定で避け済み)
      if (importanceSum === PAGE_IMPORTANCE_LIMIT) {
        currentPage++
        importanceSum = 0
      }
    } else {
      // レガシー/ユーザー仕様: パネルを加算してから >= LIMIT になったらページを閉じる。
      // 超過(>LIMIT) も許容し、そのパネルは同ページ内に残る。
      if (importanceSum >= PAGE_IMPORTANCE_LIMIT) {
        currentPage++
        importanceSum = 0
      }
    }
  }

  const totalPanels = script.panels.length
  const maxPageNumber = resultPanels.reduce((max, panel) => Math.max(max, panel.pageNumber), 0)
  const totalPages = maxPageNumber
  const averagePanelsPerPage = totalPages > 0 ? totalPanels / totalPages : 0

  // Calculate remaining importance from the last (possibly partial) page.
  // We must include the initialImportance carry that started this segment. That carry only applies to the
  // very first page of this segment. If the segment produced multiple pages, only the first page's
  // accumulated importance includes initialImportance. Our goal: determine the residual importance to
  // carry forward (if page not saturated) and whether the last page ended exactly on a boundary.
  const lastPagePanels = resultPanels.filter(panel => panel.pageNumber === maxPageNumber)
  const lastPagePanelsImportance = lastPagePanels.reduce((sum, panel) => {
    const originalPanel = script.panels[panel.panelIndex - 1] // Convert back to 0-based index
    const imp = Math.max(1, Math.min(PAGE_IMPORTANCE_LIMIT, originalPanel.importance || 1))
    return sum + imp
  }, 0)

  // Determine if the last produced page is also the first page (only one page in this segment)
  const onlyOnePageInSegment = maxPageNumber === 1

  // If only one page in segment, the effective total importance on that page includes the starting carry.
  // Otherwise, the last page importance is just the sum within that page (carry was consumed earlier pages).
  const effectiveLastPageImportance = onlyOnePageInSegment
    ? Math.min(PAGE_IMPORTANCE_LIMIT, initialImportance) + lastPagePanelsImportance
    : lastPagePanelsImportance

  // If the effective importance reached exactly the limit (==6), we signal that next segment/page starts fresh.
  // New semantics:
  //  - A page is "saturated" if effectiveLastPageImportance >= PAGE_IMPORTANCE_LIMIT (we never carry overshoot)
  //  - If saturated: residual (lastPageTotalImportance) = 0, lastPageOpen = false, carryIntoNewPage = true
  //  - If not: residual = effectiveLastPageImportance ( < limit ), lastPageOpen = true, carryIntoNewPage = false
  const saturated = effectiveLastPageImportance >= PAGE_IMPORTANCE_LIMIT
  const lastPageOpen = !saturated
  const lastPageImportance = saturated ? 0 : effectiveLastPageImportance
  const carryIntoNewPage = saturated

  return {
    pageBreaks: { panels: resultPanels },
    stats: {
      totalPages,
      totalPanels,
      averagePanelsPerPage: Math.round(averagePanelsPerPage * 100) / 100,
      importanceDistribution,
      lastPageTotalImportance: lastPageImportance,
      lastPageOpen,
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
