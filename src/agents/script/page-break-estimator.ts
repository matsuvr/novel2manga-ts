// Compatibility shim for tests: provide a non-segmented estimator facade.
// Internally delegates to the segmented estimator and returns its pageBreaks.
import { estimatePageBreaksSegmented } from '@/agents/script/segmented-page-break-estimator'
import type { NewMangaScript } from '@/types/script'

export async function estimatePageBreaks(
  script: unknown,
  options: { jobId: string; useImportanceBased?: boolean },
): Promise<{ panels: unknown[] }> {
  const res = await estimatePageBreaksSegmented(script as NewMangaScript, options)
  return res.pageBreaks
}

export default { estimatePageBreaks }
