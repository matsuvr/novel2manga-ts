import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type PageBreakPlan, PageBreakSchema, type Script } from '@/types/script'

export async function estimatePageBreaks(
  script: Script,
  opts: { avgLinesPerPage: number; jobId?: string; episodeNumber?: number },
): Promise<PageBreakPlan> {
  const generator = getLlmStructuredGenerator()
  // Read prompts directly from app config to avoid test mocks on '@/config'
  const appCfg = getAppConfigWithOverrides()
  const pb = appCfg.llm.pageBreakEstimation || { systemPrompt: '', userPromptTemplate: '' }
  const cfg = {
    systemPrompt: pb.systemPrompt,
    userPromptTemplate: pb.userPromptTemplate,
  }
  const prompt = (cfg.userPromptTemplate || '')
    .replace('{{avgLinesPerPage}}', String(opts.avgLinesPerPage))
    .replace('{{scriptJson}}', JSON.stringify(script, null, 2))
  const result = await generator.generateObjectWithFallback({
    name: 'page-break-estimation',
    systemPrompt: cfg.systemPrompt,
    userPrompt: prompt,
    schema: PageBreakSchema as unknown as z.ZodTypeAny,
    schemaName: 'PageBreakPlan',
  })

  // Handle case where LLM returns an array instead of object
  let pageBreakPlan = result as PageBreakPlan
  if (Array.isArray(result)) {
    // If LLM returned an array, assume it's the pages array and wrap it in an object
    pageBreakPlan = { pages: result as PageBreakPlan['pages'] }
  }

  return pageBreakPlan
}
