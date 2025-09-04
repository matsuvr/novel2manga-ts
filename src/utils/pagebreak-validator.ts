import { type PageBreakV2, PageBreakV2Schema } from '@/types/script'

export interface PageBreakValidationResult {
  valid: boolean
  issues: string[]
  needsNormalization: boolean
}

/**
 * Validate PageBreakV2 structure beyond Zod: page range and monotonicity.
 * - Hard invalid → valid=false, issuesに詳細。呼び出し側でエラーとして停止。
 * - Soft anomaly（範囲超過のみ）→ valid=true, needsNormalization=true（上位で正規化通知表示）。
 */
export function validatePageBreakV2(
  plan: unknown,
  opts: { maxPages: number },
): PageBreakValidationResult {
  const parsed = PageBreakV2Schema.safeParse(plan)
  if (!parsed.success) {
    return {
      valid: false,
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      needsNormalization: false,
    }
  }
  const pb: PageBreakV2 = parsed.data
  const issues: string[] = []
  let needsNormalization = false

  // Range check and monotonicity check
  let prevPage = 1
  let prevPanelIndex = 0
  for (let i = 0; i < pb.panels.length; i++) {
    const p = pb.panels[i]
    // pageNumber range
    if (p.pageNumber > opts.maxPages) {
      needsNormalization = true // 範囲超過はソフト異常として扱い、後段で正規化
    }
    if (p.pageNumber < 1) {
      issues.push(`panel[${i}].pageNumber < 1`)
    }
    // monotonicity: non-decreasing pages, and panelIndex resets when page increments
    if (i > 0) {
      if (p.pageNumber < prevPage) {
        issues.push(`panel[${i}].pageNumber decreased (${p.pageNumber} < ${prevPage})`)
      }
      if (p.pageNumber === prevPage) {
        if (p.panelIndex <= prevPanelIndex) {
          issues.push(
            `panel[${i}].panelIndex not increasing within page (current=${p.panelIndex}, prev=${prevPanelIndex})`,
          )
        }
      } else {
        // page changed → panelIndex should restart from 1
        if (p.panelIndex !== 1) {
          issues.push(`panel[${i}].panelIndex should be 1 at new page (got ${p.panelIndex})`)
        }
      }
    } else {
      // first panel must start from page >=1 and panelIndex=1
      if (p.panelIndex !== 1) {
        issues.push(`panel[0].panelIndex must be 1 (got ${p.panelIndex})`)
      }
    }
    prevPage = p.pageNumber
    prevPanelIndex = p.panelIndex
  }

  return {
    valid: issues.length === 0,
    issues,
    needsNormalization,
  }
}
