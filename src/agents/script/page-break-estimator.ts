import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getPageBreakEstimationConfig } from '@/config'
import { type PageBreakPlan, PageBreakSchema, type Script } from '@/types/script'

export async function estimatePageBreaks(
  script: Script,
  opts: { targetPages: number; avgLinesPerPage: number; jobId?: string; episodeNumber?: number },
): Promise<PageBreakPlan> {
  const generator = getLlmStructuredGenerator()
  const cfg = getPageBreakEstimationConfig()
  const prompt = (cfg.userPromptTemplate || '')
    .replace('{{targetPages}}', String(opts.targetPages))
    .replace('{{avgLinesPerPage}}', String(opts.avgLinesPerPage))
    .replace('{{scriptJson}}', JSON.stringify(script, null, 2))
  const result = await generator.generateObjectWithFallback({
    name: 'page-break-estimation',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: PageBreakSchema as unknown as z.ZodTypeAny,
    schemaName: 'PageBreakPlan',
  })
  return result as PageBreakPlan
}
