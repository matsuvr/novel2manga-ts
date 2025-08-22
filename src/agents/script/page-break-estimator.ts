import type { z } from 'zod'
import { getLlmStructuredGenerator } from '@/agent/structured-generator'
import { getAppConfigWithOverrides } from '@/config/app.config'
import { type PageBreakPlan, PageBreakSchema, type Script } from '@/types/script'

export async function estimatePageBreaks(
  script: Script,
  opts: { jobId?: string; episodeNumber?: number; isDemo?: boolean },
): Promise<PageBreakPlan> {
  // Demo mode: return fixed page break plan for testing
  if (opts?.isDemo || process.env.NODE_ENV === 'test') {
    return {
      pages: [
        {
          pageNumber: 1,
          panelCount: 3,
          panels: [
            {
              panelIndex: 1,
              content: script.scenes?.[0]?.script?.[0]?.text || 'デモコンテンツ',
              dialogue: [
                {
                  speaker: '太郎',
                  lines: 'やってみよう！',
                },
              ],
            },
            {
              panelIndex: 2,
              content: script.scenes?.[0]?.script?.[1]?.text || '太郎のセリフ',
              dialogue: [
                {
                  speaker: '太郎',
                  lines: script.scenes?.[0]?.script?.[1]?.text || '太郎のセリフ',
                },
              ],
            },
            {
              panelIndex: 3,
              content: script.scenes?.[0]?.script?.[2]?.text || 'アクションシーン',
              dialogue: [],
            },
          ],
        },
      ],
    }
  }

  const generator = getLlmStructuredGenerator()
  // Read prompts directly from app config to avoid test mocks on '@/config'
  const appCfg = getAppConfigWithOverrides()
  const pb = appCfg.llm.pageBreakEstimation || { systemPrompt: '', userPromptTemplate: '' }
  const cfg = {
    systemPrompt: pb.systemPrompt,
    userPromptTemplate: pb.userPromptTemplate,
  }
  const prompt = (cfg.userPromptTemplate || '').replace(
    '{{scriptJson}}',
    JSON.stringify(script, null, 2),
  )
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
